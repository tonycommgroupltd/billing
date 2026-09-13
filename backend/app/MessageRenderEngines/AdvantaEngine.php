<?php

namespace App\MessageRenderEngines;

use App\Interfaces\MessageRenderEngine;

class AdvantaEngine implements MessageRenderEngine
{
    public function __invoke($design, $body)
    {
        return view($design . '.html')
            ->with([
                'content' => $body,
                'design' => $design,
            ]);
    }
}
