<?php

namespace App;

use App\Models\MessageTemplate;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Log;

abstract class AbstractMessage
{
    protected static $name;

    /**
     * @var Models\MessageTemplate
     */

    /**
     * @var array
     */
    protected $contentVars;

    protected $templateKey;

    public function __construct(array $contentVars, string $templateKey)
    {
        $this->contentVars = $contentVars;
        $this->templateKey = $templateKey;
    }

    protected function generateText($table, $content, MessageTemplate $template, $locale = null)
    {
        $content = $content[$locale] ?? $content;

        $body = $this->getTranslation($template, $table, $locale);

        foreach ($content as $index => $var) {
            $searchWord = sprintf('[[%s]]', $index);
            $body = str_ireplace($searchWord, $var, $body, $count);
        }

        return $body;
    }

    protected function generateBody($content, MessageTemplate $template, $locale = null)
    {
        $body = $this->generateText('message', $content, $template, $locale);

        if (empty($body)) {
            Log::alert("The body for template \"{$template->name}\" (id: {$template->id}) is empty.");
        }

        return $body;
    }

    protected function getTranslation($template, $column, $locale)
    {
        return $template->getTranslation($column, $locale);
    }

    public function renderMessage()
    {
        return $this->dispatchMessageTemplates();
    }

    public function dispatchMessageTemplates()
    {
        $messageTemplate = $this->getMessageTemplates();
        return $this->buildMessage($messageTemplate, $locale = null);
    }

    private function buildMessage($template, $locale)
    {
        $body = $this->generateBody($this->contentVars, $template, 'en');
        return $body;
    }

    public static function name()
    {
        return static::$name ?: static::parsedClassName();
    }

    private static function parsedClassName()
    {
        return Str::title(Str::snake(class_basename(get_called_class()), ' '));
    }

    private function getMessageTemplates()
    {

        return MessageTemplate::where('message_class', $this->templateKey)->first();
    }
}
