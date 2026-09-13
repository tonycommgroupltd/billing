<?php

namespace App\Messages;

use App\AbstractMessage;

class DisconnectionReminderMessage extends AbstractMessage
{
    public static function name()
    {
        return __('DisconnectionReminderTemplate');
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
            'due_amount' => __('Due amount'),
            'account' => __('Account'),
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
