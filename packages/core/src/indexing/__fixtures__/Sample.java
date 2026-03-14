package com.example.app;

import java.util.List;
import java.util.Map;
import com.example.models.User;

public class UserService {
    private final Map<String, User> cache;

    public UserService() {
        this.cache = new HashMap<>();
    }

    public User findById(String id) {
        return cache.get(id);
    }

    public List<User> findAll() {
        return new ArrayList<>(cache.values());
    }

    private void validateUser(User user) {
        if (user.getName() == null) {
            throw new IllegalArgumentException("Name required");
        }
    }
}

interface UserRepository {
    User findById(String id);
    List<User> findAll();
}

enum UserRole {
    ADMIN,
    USER,
    GUEST
}
