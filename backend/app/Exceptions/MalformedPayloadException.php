<?php

namespace App\Exceptions;

use Exception;

class MalformedPayloadException extends Exception
{
    public function __construct(string $path)
    {
        parent::__construct("The received payload is malformed: Missing required $path parameter.");
    }
}
