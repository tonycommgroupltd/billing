<?php

namespace App\Interfaces;

interface MessageRenderEngine
{
    public function __invoke($design, $body);
}
