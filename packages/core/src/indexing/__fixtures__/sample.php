<?php

namespace App\Services;

use App\Models\User;
use App\Contracts\AuthInterface;

class AuthService implements AuthInterface
{
    private $users;

    public function __construct()
    {
        $this->users = [];
    }

    public function authenticate(string $email, string $password): ?User
    {
        foreach ($this->users as $user) {
            if ($user->email === $email) {
                return $user;
            }
        }
        return null;
    }

    public function register(string $name, string $email): User
    {
        $user = new User($name, $email);
        $this->users[] = $user;
        return $user;
    }
}

interface AuthInterface
{
    public function authenticate(string $email, string $password): ?User;
    public function register(string $name, string $email): User;
}

function helper_format(string $value): string
{
    return strtolower(trim($value));
}
