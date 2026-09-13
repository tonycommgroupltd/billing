<?php

namespace App\Messages;

use App\AbstractMessage;

class AdminWelcomeMessage extends AbstractMessage
{
    public static function name()
    {
        return __('AdminWelcomeTemplate');
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
            'first_name' => __('First name'),
            'admin_login' => __('Admin login'),
            'admin_password' => __('Admin password'),
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
            'administrator' => __('Administrator'),
        ];
    }
}
