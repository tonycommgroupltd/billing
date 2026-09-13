<?php

namespace App\Messages;

use App\AbstractMessage;

class OnPaymentMessage extends AbstractMessage
{
    public static function name()
    {
        return __('OnPaymentTemplate');
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
            'amount' => __('Amount received'),
            'applied' => __('Applied'),
            'due_date' => __('Next due date'),
            'credit' => __('Credit balance'),
            'monthly' => __('Monthly price'),
            'to_pay' => __('Amount to complete the month'),
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
