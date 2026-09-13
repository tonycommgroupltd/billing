<?php

namespace App\Messages;

use App\AbstractMessage;

class InvoiceGenerateMessage extends AbstractMessage
{
    public static function name()
    {
        return __('InvoiceGenerateTemplate');
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
            'type' => __('Type'),
            'due_date' => __('Due date'),
            'due_amount' => __('Due amount'),
            'account' => __('Account')
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
