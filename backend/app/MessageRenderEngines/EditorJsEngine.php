<?php

namespace App\MessageRenderEngines;

use App\Interfaces\MessageRenderEngine;

class EditorJsEngine implements MessageRenderEngine
{
    
    public function __invoke($design, $body)
    {
        $blocks = $this->buildBlocks($body);

        return view($design.'.editor-js')
            ->with([
                'blocks' => $blocks,
                'design' => $design,
            ]);
    }

    private function buildBlocks($body){
        #todo build blocks logic

        return $body['blocks'];
    }
}