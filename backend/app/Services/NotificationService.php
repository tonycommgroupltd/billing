<?php

namespace App\Services;

use App\Models\InAppNotification;
use App\Models\User;

class NotificationService
{
    public static function notify(
        int $userId,
        string $type,
        string $title,
        string $message,
        ?string $icon = 'bell',
        ?string $link = null
    ): ?InAppNotification {
        if ($userId <= 0) {
            return null;
        }

        return InAppNotification::create([
            'user_id' => $userId,
            'type' => $type,
            'title' => $title,
            'message' => $message,
            'icon' => $icon ?: 'bell',
            'link' => $link,
            'is_read' => false,
        ]);
    }

    /** @param string[] $roles */
    public static function notifyRoles(
        array $roles,
        string $type,
        string $title,
        string $message,
        ?string $icon = 'bell',
        ?string $link = null
    ): void {
        User::role($roles)->get()->each(function (User $user) use ($type, $title, $message, $icon, $link) {
            self::notify((int) $user->id, $type, $title, $message, $icon, $link);
        });
    }
}
