import { Account, ID } from 'appwrite';

export class AuthService {
  constructor(client) {
    this.account = new Account(client);
    this.user = null;
    this.signingIn = false;
  }

  async getCurrentUser() {
    try {
      this.user = await this.account.get();
      return this.user;
    } catch (error) {
      // Suppress 401 errors on initial load (expected when not logged in)
      if (error.code !== 401) {
        console.error('Get user error:', error);
      }
      this.user = null;
      return null;
    }
  }

  async signUp(email, password, name) {
    try {
      await this.account.create(ID.unique(), email, password, name);
      await this.signIn(email, password);
      return { success: true };
    } catch (error) {
      console.error('Signup error:', error);
      
      // Handle duplicate user - suggest login instead
      if (error.code === 409 || error.message.includes('already exists')) {
        return { 
          success: false, 
          error: 'An account with this email already exists. Please login instead.',
          shouldLogin: true
        };
      }
      
      return { success: false, error: error.message };
    }
  }

  async signIn(email, password) {
    if (this.signingIn) {
      try {
        const existing = await this.account.get();
        this.user = existing;
        return { success: true, user: this.user };
      } catch (e) {
        return { success: false, error: 'Another sign-in is in progress' };
      }
    }
    this.signingIn = true;
    try {
      try { await this.account.deleteSession('current'); } catch (e) {}
      const session = await this.account.createEmailPasswordSession(email, password);
      console.log('Session created:', session);
      this.user = await this.account.get();
      return { success: true, user: this.user };
    } catch (error) {
      if (error.code === 401) {
        try {
          this.user = await this.account.get();
          return { success: true, user: this.user };
        } catch (e) {
          return { success: false, error: error.message };
        }
      }
      console.error('Sign in error:', error);
      return { success: false, error: error.message };
    } finally {
      this.signingIn = false;
    }
  }

  async signInAnonymous() {
    try {
      // Try to delete any existing session first
      try {
        await this.account.deleteSession('current');
      } catch (e) {
        // Ignore if no session exists
      }
      
      await this.account.createAnonymousSession();
      this.user = await this.account.get();
      return { success: true, user: this.user };
    } catch (error) {
      // Handle existing session error
      if (error.code === 401) {
        try {
          this.user = await this.account.get();
          return { success: true, user: this.user };
        } catch (e) {
          console.error('Anonymous sign in error:', error);
          return { success: false, error: error.message };
        }
      }
      console.error('Anonymous sign in error:', error);
      return { success: false, error: error.message };
    }
  }

  async signOut() {
    try {
      await this.account.deleteSession('current');
      this.user = null;
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  isLoggedIn() {
    return this.user !== null;
  }

  getUser() {
    return this.user;
  }

  getUserName() {
    return this.user?.name || this.user?.email || 'Guest';
  }
}
