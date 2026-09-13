<?php

namespace App\Exports;

use App\Models\Service;
use Carbon\Carbon;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\FromCollection;

class ServiceExport implements FromCollection, WithHeadings
{

    public function headings(): array
    {
        return [
            'id',
            'mikrotik_name',
            'bill_to',
        ];
    }
    public function collection()
    {
        $date = Carbon::now()->subDays(1)->endOfDay();
        return Service::select('id', 'mikrotik_name', 'bill_to')->whereNotNull('bill_to')->where('bill_to', '<=', $date)->where('status->value', 2)->where('billing_type->value', '!=', 2)->orderBy('bill_to', 'ASC')->get();
    }
}
