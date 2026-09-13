<?php

namespace App\Messages;

use App\AbstractMessage;

class WelcomeMessage extends AbstractMessage
{
    public static function name()
    {
        return __('WelcomeTemplate');
    }

    /**
     * This array lists the possible variable data
     * included in the content of the mail.
     *
     * @return array
     */
    public static function getContentVariables()
    {
        return [
            'portal_url' => __('Portal login link'),
            'customer_login' => __('Customer login'),
            'customer_password' => __('Customer password'),
        ];
    }

    /**
     * This array lists the possible variable
     * recipients that can receive this mail.
     *
     * @return array
     */
    public static function getRecipientVariables()
    {
        return [
            'customer' => __('Customer'),
        ];
    }
}
