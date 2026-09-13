<?php

namespace App\Messages;

use App\AbstractMessage;

class CampaignMessage extends AbstractMessage
{
    public static function name()
    {
        return __('CampaignTemplate');
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
            //'name' => __('Name'),
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
