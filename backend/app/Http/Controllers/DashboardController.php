<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\Ipv4ScanService;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Router;
use App\Models\Payment;
use App\Models\PppoeSession;
use App\Models\Radacct;
use App\Models\Service;
use Illuminate\Support\Arr;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use League\Flysystem\FileAttributes;
use League\Flysystem\StorageAttributes;

class DashboardController extends Controller
{
    /** Short TTL so refresh feels instant; counts stay near-live. */
    private const STATS_CACHE_TTL = 60;

    /**
     * Create a new controller instance.
     *
     * @return void
     */
    public function __construct(Request $request)
    {
        $this->middleware('auth:api');
    }

    public function allstats()
    {
        $payload = Cache::remember('dashboard_allstats_v1', self::STATS_CACHE_TTL, function () {
            return $this->computeAllStats();
        });

        // Overlay remote backup outside the main cache — S3 listing is deferred so the
        // first fill often stores "Never"; once the S3 cache warms, every response
        // should show the real last remote backup without waiting 45s.
        $remote = $this->cachedRemoteBackupStats();
        $payload['server'] = $payload['server'] ?? [];
        $payload['server']['remote_backup_time'] = $remote['time'] ?? null;
        $payload['server']['remote_backup_time_ago'] = $remote['time_ago'] ?? null;
        $payload['server']['remote_backup_size'] = $remote['size'] ?? null;

        // IPv4 overlay — never block the main cache fill on MikroTik scans.
        $ipv4 = $this->cachedIpv4DashboardStats();
        $payload['ipv4_networks'] = $ipv4['ipv4_networks'] ?? 0;
        $payload['public_addresses_total'] = $ipv4['public_addresses_total'] ?? 0;
        $payload['public_addresses_used'] = $ipv4['public_addresses_used'] ?? 0;
        $payload['public_addresses_free'] = $ipv4['public_addresses_free'] ?? 0;
        $payload['private_addresses_total'] = $ipv4['private_addresses_total'] ?? 0;
        $payload['private_addresses_used'] = $ipv4['private_addresses_used'] ?? 0;
        $payload['private_addresses_free'] = max(
            0,
            ($ipv4['private_addresses_total'] ?? 0) - ($ipv4['private_addresses_used'] ?? 0)
        );

        // Standby peer status — short HTTP; keep out of the 60s customer-stats cache.
        $standby = Cache::remember('dashboard_standby_status_v1', 30, function () {
            return $this->resolveStandbyStatus();
        });
        $payload['server']['standby_sync_time'] = $standby['sync_time'] ?? null;
        $payload['server']['standby_sync_time_ago'] = $standby['sync_time_ago'] ?? null;
        $payload['server']['standby_sync_size'] = $standby['sync_size'] ?? null;
        $payload['server']['standby_sync_file'] = $standby['sync_file'] ?? null;
        $payload['server']['standby_replication_ok'] = $standby['replication_ok'] ?? null;
        $payload['server']['standby_replication_lag'] = $standby['replication_lag'] ?? null;
        $payload['server']['standby_replication_label'] = $standby['replication_label'] ?? null;
        $payload['server']['standby_replication_alert'] = $standby['replication_alert'] ?? null;

        return response()->json($payload);
    }

    private function computeAllStats(): array
    {
        $fromDate = new Carbon('first day of last month');
        $fromDate->startOfMonth();
        $tillDate = new Carbon('last day of last month');
        $tillDate->endOfMonth();
        $fromDate2 = new Carbon('first day of this month');
        $fromDate2->startOfMonth();
        $tillDate2 = new Carbon('last day of this month');
        $tillDate2->endOfMonth();

        $new_customers = Customer::active()->whereDate('created_at', '>', now()->subDays(7))->count();
        $all_customers = Customer::active()->count();
        // Avoid latestOnline()->count() (MAX(radacctid) + full join ~4s+ on 2M+ rows).
        $online_customers = $this->countOnlineCustomersFast();
        $online_today_customers = $this->countOnlineTodayCustomersFast();
        $active_customers = Customer::active()
            ->whereHas('services', function ($query) {
                $query->where('status->value', 2);
            })
            ->count();
        $blocked_customers = Customer::active()
            ->whereHas('services', function ($query) {
                $query->whereIn('status->value', [1, 3]);
            })
            ->count();
        $inactive_customers = Customer::active()
            ->whereDoesntHave('services', function ($query) {
                $query->where('status->value', '!=', 0);
            })
            ->count();
        $last_month_customers = Customer::active()->whereBetween('created_at', [$fromDate, $tillDate])->count();
        $last_year_customers = Customer::active()->whereYear('created_at', date('Y') - 1)->count();
        $all_routers = Router::count();
        $this_month_payments = Payment::whereBetween('date', [$fromDate2, $tillDate2])->count();
        $last_month_payments = Payment::whereBetween('date', [$fromDate, $tillDate])->count();
        $sum_this_month_payments = Payment::whereBetween('date', [$fromDate2, $tillDate2])->sum('sum');
        $sum_last_month_payments = Payment::whereBetween('date', [$fromDate, $tillDate])->sum('sum');
        $this_month_paid_invoices = Invoice::where('status->value', 2)->whereBetween('invoice_date', [$fromDate2, $tillDate2])->count();
        $this_month_paid_invoices_sum = Invoice::where('status->value', 2)->whereBetween('invoice_date', [$fromDate2, $tillDate2])->sum('total');
        $last_month_paid_invoices = Invoice::where('status->value', 2)->whereBetween('invoice_date', [$fromDate, $tillDate])->count();
        $last_month_paid_invoices_sum = Invoice::where('status->value', 2)->whereBetween('invoice_date', [$fromDate, $tillDate])->sum('total');
        $this_month_unpaid_invoices = Invoice::where('status->value', 1)->whereBetween('invoice_date', [$fromDate2, $tillDate2])->count();
        $this_month_unpaid_invoices_sum = Invoice::where('status->value', 1)->whereBetween('invoice_date', [$fromDate2, $tillDate2])->sum('total');
        $last_month_unpaid_invoices = Invoice::where('status->value', 1)->whereBetween('invoice_date', [$fromDate, $tillDate])->count();
        $last_month_unpaid_invoices_sum = Invoice::where('status->value', 1)->whereBetween('invoice_date', [$fromDate, $tillDate])->sum('total');
        if (!function_exists('sys_getloadavg')) {
            $sys_getloadavg = [];
        } else {
            $sys_getloadavg = sys_getloadavg();
        }
        $ncpu = 'N/A';
        if (is_file('/proc/cpuinfo')) {
            $cpuinfo = file_get_contents('/proc/cpuinfo');
            preg_match_all('/^processor/m', $cpuinfo, $matches);
            $ncpu = count($matches[0]);
        } elseif (PHP_OS_FAMILY == 'Windows') {
            $ncpu = shell_exec('echo %NUMBER_OF_PROCESSORS%');
        }

        $free = shell_exec('free -b');
        $free = (string)trim($free);
        $free_arr = explode("\n", $free);
        $memoryTotal = null;
        $memoryFree = null;
        $memoryPercentage = null;
        $memoryUsed = null;

        if (stristr(PHP_OS, "win")) {
            $cmd = "wmic ComputerSystem get TotalPhysicalMemory";
            @exec($cmd, $outputTotalPhysicalMemory);

            $cmd = "wmic OS get FreePhysicalMemory";
            @exec($cmd, $outputFreePhysicalMemory);

            if ($outputTotalPhysicalMemory && $outputFreePhysicalMemory) {
                foreach ($outputTotalPhysicalMemory as $line) {
                    if ($line && preg_match("/^[0-9]+\$/", $line)) {
                        $memoryTotal = $line;
                        break;
                    }
                }

                foreach ($outputFreePhysicalMemory as $line) {
                    if ($line && preg_match("/^[0-9]+\$/", $line)) {
                        $memoryFree = $line;
                        $memoryFree *= 1024;
                        break;
                    }
                }
            }
        } else {
            if (isset($free_arr[1])) {
                $mem = explode(" ", $free_arr[1]);
                $mem = array_filter($mem, fn($n) => $n != "");
                $mem = array_merge($mem);
                $memoryTotal = $mem[1];
                $memoryFree = $mem[3];
            }
        }
        if (!is_null($memoryTotal) && !is_null($memoryFree)) {
            $memoryUsed = $memoryTotal - $memoryFree;
            $memoryPercentage = number_format(($memoryFree * 100 / $memoryTotal), 2, '.');
        }

        $diskfree =  disk_free_space('.');
        $disktotal = disk_total_space('.');
        $diskused = $disktotal - $diskfree;
        $swap = [];
        if (isset($free_arr[2])) {
            $swap_mem = explode(" ", $free_arr[2]);
            $swap_mem = array_filter($swap_mem, fn($n) => $n != "");
            $swap_mem = array_merge($swap_mem);
            $swap_per = $swap_mem[3] > 0 ? number_format(($swap_mem[3] / $swap_mem[1]) * 100, 2, '.') : 0.00;
            if ($swap_mem[1] > 0) {
                $swap = [
                    "total_bytes" => $swap_mem[1],
                    "free_bytes" => $swap_mem[3],
                    "used_bytes" => $swap_mem[2],
                    "total" => $this->human_filesize($swap_mem[1]),
                    "free" => $this->human_filesize($swap_mem[3]),
                    "used" => $this->human_filesize($swap_mem[2]),
                    "percent" => $swap_per
                ];
            }
        }
        $backupPath = storage_path('app/' . config('app.name'));
        $files = File::isDirectory($backupPath) ? File::files($backupPath) : [];
        $backup_time = null;
        $backup_time_ago = null;
        $backup_size = null;
        if (!empty($files)) {
            $mostRecentFile = collect($files)->sortByDesc(fn($file) => $file->getMTime())->first();
            $backup_time = Carbon::parse($mostRecentFile->getMTime())->format('Y-m-d H:i:s');
            $backup_time_ago = Carbon::parse($mostRecentFile->getMTime())->diffForHumans();
            $backup_size = $this->human_filesize($mostRecentFile->getSize());
        }

        $remoteBackup = $this->cachedRemoteBackupStats();
        $cpuSample = $this->sampleCpuUsage();

        return [
            'new_customers' => $new_customers,
            'all_customers' => $all_customers,
            'online_customers' => $online_customers,
            'online_today_customers' => $online_today_customers,
            'active_customers' => $active_customers,
            'blocked_customers' => $blocked_customers,
            'inactive_customers' => $inactive_customers,
            'last_month_customers' => $last_month_customers,
            'last_year_customers' => $last_year_customers,
            'all_routers' => $all_routers,
            'ipv4_networks' => 0,
            'public_addresses_total' => 0,
            'public_addresses_used' => 0,
            'public_addresses_free' => 0,
            'private_addresses_total' => 0,
            'private_addresses_used' => 0,
            'private_addresses_free' => 0,
            'this_month_payments' => $this_month_payments,
            'last_month_payments' => $last_month_payments,
            'sum_this_month_payments' => number_format($sum_this_month_payments, 2),
            'sum_last_month_payments' => number_format($sum_last_month_payments, 2),
            'this_month_paid_invoices' => $this_month_paid_invoices,
            'this_month_paid_invoices_sum' => number_format($this_month_paid_invoices_sum, 2),
            'last_month_paid_invoices' => $last_month_paid_invoices,
            'last_month_paid_invoices_sum' => number_format($last_month_paid_invoices_sum, 2),
            'this_month_unpaid_invoices' => $this_month_unpaid_invoices,
            'this_month_unpaid_invoices_sum' => number_format($this_month_unpaid_invoices_sum, 2),
            'last_month_unpaid_invoices' => $last_month_unpaid_invoices,
            'last_month_unpaid_invoices_sum' => number_format($last_month_unpaid_invoices_sum, 2),
            "server" => [
                "cores" => $ncpu,
                "load_average" => implode(', ', array_map(function ($num) {
                    return number_format($num, 2);
                }, $sys_getloadavg)),
                "memory" => [
                    "total_bytes" => $memoryTotal ?? 0,
                    "free_bytes" => $memoryFree ?? 0,
                    "used_bytes" => $memoryUsed ?? 0,
                    "total" => $this->human_filesize($memoryTotal ?? 0),
                    "free" => $this->human_filesize($memoryFree ?? 0),
                    "used" => $this->human_filesize($memoryUsed ?? 0),
                    "percent" => $memoryPercentage ?? 0
                ],
                "swap" => $swap,
                "disk" => [
                    "total_bytes" => $disktotal,
                    "free_bytes" => $diskfree,
                    "used_bytes" => $diskused,
                    "total" => $this->human_filesize($disktotal),
                    "free" => $this->human_filesize($diskfree),
                    "used" => $this->human_filesize($diskused),
                    "percent" => number_format(($diskfree / $disktotal * 100), 2, '.')
                ],
                "backup_time" => $backup_time,
                "backup_time_ago" => $backup_time_ago,
                "backup_size" => $backup_size,
                "remote_backup_time" => $remoteBackup['time'] ?? null,
                "remote_backup_time_ago" => $remoteBackup['time_ago'] ?? null,
                "remote_backup_size" => $remoteBackup['size'] ?? null,
                "standby_sync_time" => null,
                "standby_sync_time_ago" => null,
                "standby_sync_size" => null,
                "standby_sync_file" => null,
                "standby_replication_ok" => null,
                "standby_replication_lag" => null,
                "standby_replication_label" => null,
                "standby_replication_alert" => null,
                "cpu_usage" => $cpuSample['cpu_usage'],
                "iowait" => $cpuSample['iowait'],
            ]
        ];
    }

    /**
     * COUNT(DISTINCT username) for open sessions updated in the last 7 minutes.
     * Skips the expensive MAX(radacctid) subquery used by latestOnline().
     */
    private function countOnlineCustomersFast(): int
    {
        return (int) Cache::remember('dashboard_online_count_v1', 30, function () {
            $row = DB::selectOne("
                SELECT COUNT(DISTINCT radacct.username) AS c
                FROM radacct
                INNER JOIN services ON services.mikrotik_name = radacct.username
                WHERE JSON_UNQUOTE(JSON_EXTRACT(services.status, '$.value')) = '2'
                  AND radacct.acctstoptime IS NULL
                  AND radacct.acctupdatetime >= DATE_SUB(NOW(), INTERVAL 7 MINUTE)
            ");

            return (int) ($row->c ?? 0);
        });
    }

    private function countOnlineTodayCustomersFast(): int
    {
        return (int) Cache::remember('dashboard_online_today_v1', 60, function () {
            $row = DB::selectOne("
                SELECT COUNT(DISTINCT radacct.username) AS c
                FROM radacct
                INNER JOIN services ON services.mikrotik_name = radacct.username
                WHERE JSON_UNQUOTE(JSON_EXTRACT(services.status, '$.value')) = '2'
                  AND radacct.acctupdatetime >= CURDATE()
                  AND radacct.acctupdatetime < CURDATE() + INTERVAL 1 DAY
            ");

            return (int) ($row->c ?? 0);
        });
    }

    /**
     * @return array{cpu_usage: float|null, iowait: float|null}
     */
    private function sampleCpuUsage(): array
    {
        $current = $this->readProcStatCpuLine();
        if ($current === null) {
            return ['cpu_usage' => null, 'iowait' => null];
        }

        $previous = Cache::get('dashboard_cpu_sample_v1');
        Cache::put('dashboard_cpu_sample_v1', $current, 120);

        if (!is_array($previous)) {
            return ['cpu_usage' => null, 'iowait' => null];
        }

        $totalDelta = $current['total'] - ($previous['total'] ?? 0);
        if ($totalDelta <= 0) {
            return ['cpu_usage' => 0.0, 'iowait' => 0.0];
        }

        $idleDelta = $current['idle'] - ($previous['idle'] ?? 0);
        $iowaitDelta = $current['iowait'] - ($previous['iowait'] ?? 0);

        $cpuUsage = round((1 - ($idleDelta / $totalDelta)) * 100, 1);
        $iowaitPct = round(($iowaitDelta / $totalDelta) * 100, 1);

        return [
            'cpu_usage' => max(0, min(100, $cpuUsage)),
            'iowait' => max(0, min(100, $iowaitPct)),
        ];
    }

    /**
     * @return array{total: int, idle: int, iowait: int}|null
     */
    private function readProcStatCpuLine(): ?array
    {
        if (!is_readable('/proc/stat')) {
            return null;
        }

        $line = @file('/proc/stat', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES)[0] ?? '';
        if (!str_starts_with($line, 'cpu ')) {
            return null;
        }

        $parts = preg_split('/\s+/', trim($line));
        array_shift($parts);
        $nums = array_map('intval', $parts);
        if (count($nums) < 5) {
            return null;
        }

        return [
            'total' => array_sum($nums),
            'idle' => $nums[3],
            'iowait' => $nums[4],
        ];
    }

    private function cachedIpv4DashboardStats(): array
    {
        return Cache::remember('dashboard_ipv4_stats_v1', 120, function () {
            try {
                return app(Ipv4ScanService::class)->dashboardStats();
            } catch (\Throwable $e) {
                Log::warning('Dashboard IPv4 stats failed: ' . $e->getMessage());
                return [
                    'ipv4_networks' => 0,
                    'public_addresses_total' => 0,
                    'public_addresses_used' => 0,
                    'public_addresses_free' => 0,
                    'private_addresses_total' => 0,
                    'private_addresses_used' => 0,
                ];
            }
        });
    }

    private function cachedRemoteBackupStats(): array
    {
        $cached = Cache::get('dashboard_s3_backup_v1');
        if (is_array($cached) && !empty($cached['time'])) {
            // Refresh relative "time ago" without re-listing S3.
            try {
                $cached['time_ago'] = Carbon::parse($cached['time'])->diffForHumans();
            } catch (\Throwable $e) {
                // keep stored time_ago
            }
            return $cached;
        }

        // Do not list S3 on the dashboard hot path — Contabo↔object storage latency
        // was freezing online/new customer cards until the listing finished.
        // Fill cache opportunistically after the response when possible.
        if (Cache::add('dashboard_s3_refreshing', 1, 180)) {
            register_shutdown_function(function () {
                try {
                    $s3files = Storage::disk('s3')
                        ->listContents(config('app.name'))
                        ->filter(fn(StorageAttributes $attributes) => $attributes->isFile())
                        ->toArray();

                    $payload = ['time' => null, 'time_ago' => null, 'size' => null];
                    if (!empty($s3files)) {
                        $mostRecents3File = collect($s3files)
                            ->sortByDesc(fn(FileAttributes $file) => $file->lastModified())
                            ->first();
                        if ($mostRecents3File) {
                            $ts = Carbon::createFromTimestamp($mostRecents3File->lastModified());
                            $payload = [
                                'time' => $ts->format('Y-m-d H:i:s'),
                                'time_ago' => $ts->diffForHumans(),
                                'size' => $this->human_filesize($mostRecents3File->fileSize()),
                            ];
                        }
                    }
                    Cache::put('dashboard_s3_backup_v1', $payload, 300);
                } catch (\Throwable $e) {
                    Cache::put('dashboard_s3_backup_v1', [
                        'time' => null,
                        'time_ago' => null,
                        'size' => null,
                    ], 120);
                } finally {
                    Cache::forget('dashboard_s3_refreshing');
                }
            });
        }

        return is_array($cached) ? $cached : ['time' => null, 'time_ago' => null, 'size' => null];
    }

    private function resolveStandbyStatus(): array
    {
        $raw = config('ha.server_role') === 'standby'
            ? app(\App\Services\StandbyStatusService::class)->snapshot()
            : StandbyStatusController::fetchFromPeer();

        if (!$raw) {
            return [
                'sync_time' => null,
                'sync_time_ago' => null,
                'sync_size' => null,
                'sync_file' => null,
                'replication_ok' => null,
                'replication_lag' => null,
                'replication_label' => 'Unreachable',
                'replication_alert' => 'Standby status unreachable',
            ];
        }

        $backup = $raw['backup'] ?? [];
        $repl = $raw['replication'] ?? [];
        $io = $repl['io_running'] ?? null;
        $sql = $repl['sql_running'] ?? null;
        $lag = $repl['seconds_behind'] ?? null;
        $lastError = $repl['last_error'] ?? null;

        $lagThreshold = 30;
        $replAlert = $repl['alert'] ?? null;
        $masterUnreachable = (bool) ($repl['master_unreachable'] ?? false);
        $replOk = ($repl['configured'] ?? false)
            && $sql === 'Yes'
            && ($io === 'Yes' || $masterUnreachable)
            && ($lag === null || $lag <= $lagThreshold)
            && (empty($replAlert) || $masterUnreachable);

        if (!($repl['configured'] ?? false)) {
            $replLabel = 'Not configured';
        } elseif ($masterUnreachable) {
            $replLabel = 'Master offline — standby live';
        } elseif ($io === 'Yes' && $sql === 'Yes') {
            if ($lag === null) {
                $replLabel = 'OK';
            } elseif ($lag <= $lagThreshold) {
                $replLabel = "OK ({$lag}s behind)";
            } else {
                $replLabel = "Lagging ({$lag}s behind)";
            }
        } else {
            $parts = ["IO:{$io}", "SQL:{$sql}"];
            if ($lastError) {
                $parts[] = mb_substr((string) $lastError, 0, 80);
            }
            $replLabel = implode(' ', $parts);
        }

        if (!$replOk && !$replAlert) {
            if ($sql !== 'Yes') {
                $replAlert = 'Replica SQL thread is not running';
            } elseif ($io !== 'Yes') {
                $replAlert = 'Replica IO thread is not running';
            } elseif ($lag !== null && $lag > $lagThreshold) {
                $replAlert = "Replica lag is {$lag}s (threshold {$lagThreshold}s)";
            }
        }

        return [
            'sync_time' => $backup['time'] ?? null,
            'sync_time_ago' => $backup['time_ago'] ?? null,
            'sync_size' => $backup['size'] ?? null,
            'sync_file' => $backup['file'] ?? null,
            'replication_ok' => $replOk,
            'replication_lag' => $lag,
            'replication_label' => $replLabel,
            'replication_alert' => $replAlert,
        ];
    }

    public function custstats($id)
    {
        $customer = Customer::active()->where('user_id', $id)->first();
        $services = Service::where('customer_id', $customer->id)->where('status->value', '!=', 0)->latest()->take(20)->get();
        $unpaid_invoices = Invoice::select('invoices.*')->leftJoin('services', 'invoices.services_id', '=', 'services.id')->where('invoices.status->value', 1)->whereNotNull('services.customer_id')->where('services.customer_id', $customer->id)->latest()->take(10)->get();

        return response()->json([
            'customer' => $customer,
            'services' => $services,
            'invoices' => $unpaid_invoices,
        ]);
    }

    private function human_filesize($bytes, $dec = 2): string
    {
        $size   = array('B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB');
        $factor = floor((strlen($bytes) - 1) / 3);
        if ($factor == 0) $dec = 0;
        return sprintf("%.{$dec}f %s", $bytes / (1024 ** $factor), $size[$factor]);
    }
}
