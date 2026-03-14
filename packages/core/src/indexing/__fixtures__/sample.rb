require 'json'
require_relative './user'

module Authentication
  class SessionManager
    def initialize(store)
      @store = store
    end

    def create_session(user)
      token = SecureRandom.hex(32)
      @store[token] = user
      token
    end

    def find_session(token)
      @store[token]
    end

    def destroy_session(token)
      @store.delete(token)
    end
  end

  class TokenValidator
    def self.validate(token)
      token && token.length == 64
    end
  end
end

def helper_function(arg)
  arg.to_s.upcase
end
