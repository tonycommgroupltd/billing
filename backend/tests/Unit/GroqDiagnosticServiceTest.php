<?php

namespace Tests\Unit;

use App\Services\AppToolsService;
use App\Services\GroqDiagnosticService;
use Illuminate\Support\Facades\Http;
use Mockery;
use RuntimeException;
use Tests\TestCase;

class GroqDiagnosticServiceTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_it_returns_the_assistant_answer_without_tools(): void
    {
        config()->set('services.groq.key', 'test-key');
        config()->set('services.groq.base_url', 'https://api.groq.test/openai/v1');
        config()->set('services.groq.model', 'test-model');

        $tools = Mockery::mock(AppToolsService::class);
        $tools->shouldReceive('schemas')->andReturn([]);

        Http::fake([
            'https://api.groq.test/openai/v1/chat/completions' => Http::response([
                'choices' => [
                    ['message' => ['content' => 'Looks fine to me.']],
                ],
            ]),
        ]);

        $answer = (new GroqDiagnosticService($tools))->chat('hey')['answer'];
        $this->assertSame('Looks fine to me.', $answer);
    }

    public function test_it_runs_tool_calls_then_answers(): void
    {
        config()->set('services.groq.key', 'test-key');
        config()->set('services.groq.base_url', 'https://api.groq.test/openai/v1');
        config()->set('services.groq.model', 'test-model');

        $tools = Mockery::mock(AppToolsService::class);
        $tools->shouldReceive('schemas')->andReturn([
            [
                'type' => 'function',
                'function' => [
                    'name' => 'lookup_customer',
                    'description' => 'Search customers',
                    'parameters' => ['type' => 'object', 'properties' => []],
                ],
            ],
        ]);
        $tools->shouldReceive('call')
            ->once()
            ->with('lookup_customer', ['q' => '0712848481'])
            ->andReturn(['customers' => [['id' => 1, 'name' => 'Joram']]]);

        Http::fake([
            'https://api.groq.test/openai/v1/chat/completions' => Http::sequence()
                ->push([
                    'choices' => [[
                        'message' => [
                            'content' => null,
                            'tool_calls' => [[
                                'id' => 'call_1',
                                'type' => 'function',
                                'function' => [
                                    'name' => 'lookup_customer',
                                    'arguments' => '{"q":"0712848481"}',
                                ],
                            ]],
                        ],
                    ]],
                ])
                ->push([
                    'choices' => [[
                        'message' => ['content' => 'Found Joram on that number.'],
                    ]],
                ]),
        ]);

        $result = (new GroqDiagnosticService($tools))->chat('who is 0712848481?');
        $this->assertSame('Found Joram on that number.', $result['answer']);
        $this->assertSame(['lookup_customer'], $result['tools_used']);
    }

    public function test_it_refuses_to_run_without_a_server_side_key(): void
    {
        config()->set('services.groq.key', null);
        $tools = Mockery::mock(AppToolsService::class);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('GROQ_API_KEY');

        (new GroqDiagnosticService($tools))->chat('hello');
    }
}
