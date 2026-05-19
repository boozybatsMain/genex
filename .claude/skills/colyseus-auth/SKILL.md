---
name: colyseus-auth
description: "Colyseus authentication reference. Covers @colyseus/auth module setup, environment variables (AUTH_SALT, JWT_SECRET, SESSION_SECRET), frontend auth API (registerWithEmailAndPassword, signInWithEmailAndPassword, signInAnonymously, signInWithProvider, sendPasswordResetEmail, getUserData, onChange, signOut), backend callbacks (onFindUserByEmail, onRegisterWithEmailAndPassword, onRegisterAnonymously, onHashPassword, onSendEmailConfirmation, onEmailConfirmed, onForgotPassword, onResetPassword, onParseToken, onGenerateToken), OAuth 2.0 (200+ providers, Discord, Google, Twitter), room-level onAuth (static vs instance), auth context (token, headers, ip), HTTP middleware (auth.middleware), account linking, and email templates. Use when implementing user authentication, adding OAuth providers, protecting HTTP endpoints, or handling room-level auth."
---

# Colyseus Authentication Reference

Reference for `@colyseus/auth` module and room-level authentication.

## Installation

```bash
npm install --save @colyseus/auth
```

## Required Environment Variables

```env
AUTH_SALT=your-salt-for-scrypt-hashing
JWT_SECRET=your-jwt-signing-secret
SESSION_SECRET=your-session-cookie-secret
```

| Variable | Purpose |
|----------|---------|
| `AUTH_SALT` | Password hashing via scrypt algorithm |
| `JWT_SECRET` | JWT token signing and verification |
| `SESSION_SECRET` | Session cookie signing during OAuth flows |

## Server Setup

### Express Integration

```typescript
import { auth } from '@colyseus/auth';

// In defineServer or Express app:
app.use(auth.prefix, auth.routes());
```

## Frontend Auth API

All methods are available on `client.auth`:

### Registration & Sign-In

```typescript
// Email/password registration (auto-signs in)
await client.auth.registerWithEmailAndPassword(email, password, options?);

// Email/password sign-in
await client.auth.signInWithEmailAndPassword(email, password);

// Anonymous sign-in
await client.auth.signInAnonymously(options?);

// OAuth sign-in (opens provider popup/redirect)
await client.auth.signInWithProvider('discord');
await client.auth.signInWithProvider('google');
```

### Account Management

```typescript
// Get current user data
const user = await client.auth.getUserData();

// Listen for auth state changes
client.auth.onChange((userData) => {
  console.log('Auth changed:', userData);
});

// Send password reset email
await client.auth.sendPasswordResetEmail();

// Sign out (clears token)
await client.auth.signOut();
```

### Setting Auth Token

```typescript
// If using your own auth system, set token manually
client.auth.token = 'YOUR_JWT_TOKEN';

// Token is automatically sent with all join/create calls
const room = await client.joinOrCreate('sandbox');
```

## Backend Configuration Callbacks

### Email/Password Authentication

```typescript
import { auth } from '@colyseus/auth';

// Find user by email (database lookup)
auth.settings.onFindUserByEmail = async (email: string) => {
  return await db.users.findUnique({ where: { email } });
};

// Register new user
auth.settings.onRegisterWithEmailAndPassword = async (email, password, options) => {
  const user = await db.users.create({
    data: { email, password, ...options },
  });
  return user; // Returned data becomes JWT payload
};

// Custom password hashing (optional, scrypt by default)
auth.settings.onHashPassword = async (password: string) => {
  return await bcrypt.hash(password, 12);
};
```

### Anonymous Authentication

```typescript
auth.settings.onRegisterAnonymously = async (options) => {
  const user = await db.users.create({
    data: { anonymous: true, ...options },
  });
  return user; // JWT payload
};
```

### Email Verification (Optional)

```typescript
// Send verification email
auth.settings.onSendEmailConfirmation = async (email, html, link) => {
  await sendEmail({
    to: email,
    subject: 'Verify your email',
    html,
  });
};

// Mark email as verified
auth.settings.onEmailConfirmed = async (email) => {
  await db.users.update({
    where: { email },
    data: { emailVerified: true },
  });
};
```

### Password Recovery

```typescript
// Send reset email
auth.settings.onForgotPassword = async (email, html, resetLink) => {
  await sendEmail({
    to: email,
    subject: 'Reset your password',
    html,
  });
};

// Apply new password
auth.settings.onResetPassword = async (email, password) => {
  await db.users.update({
    where: { email },
    data: { password },
  });
};
```

### Token Customization

```typescript
// Modify user data before sending to frontend
auth.settings.onParseToken = async (data) => {
  // Strip sensitive fields
  const { password, ...safe } = data;
  return safe;
};

// Customize token generation
auth.settings.onGenerateToken = async (userdata) => {
  return { ...userdata, permissions: ['read', 'write'] };
};
```

## OAuth 2.0 (200+ Providers)

### Adding a Provider

```typescript
auth.oauth.addProvider('discord', {
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  scope: ['identify', 'email'],
});

auth.oauth.addProvider('google', {
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
});
```

### Handling OAuth Callback

```typescript
auth.oauth.onCallback = async (data, provider) => {
  // data contains profile from OAuth provider
  let user = await db.users.findFirst({
    where: { [`${provider}Id`]: data.id },
  });

  if (!user) {
    user = await db.users.create({
      data: {
        [`${provider}Id`]: data.id,
        email: data.email,
        name: data.name,
      },
    });
  }

  return user; // JWT payload
};
```

### Backend URL Configuration

```typescript
// Required for OAuth redirect callbacks
auth.settings.backend_url = 'https://api.yourgame.com';
```

## Room-Level Authentication (onAuth)

### Static onAuth (Recommended)

```typescript
import { Room, Client, ServerError } from '@colyseus/core';
import { JWT } from '@colyseus/auth';

export class GameRoom extends Room<GameState> {
  // Static — no room instance access, called before room is created
  static async onAuth(token: string, options: any, context: AuthContext) {
    const userdata = await JWT.verify(token);
    if (!userdata) throw new ServerError(401, 'Unauthorized');
    return userdata; // Available as client.auth in onJoin
  }

  override async onJoin(client: Client, options: any, auth: User) {
    console.log(auth);        // Returned by onAuth
    console.log(client.auth); // Same as auth (equivalent shorthand)
  }
}
```

### Instance onAuth (Legacy)

```typescript
// Instance method — has access to room state
async onAuth(client: Client, options: any, context: AuthContext) {
  const userdata = await JWT.verify(context.token);
  return userdata;
}
```

### AuthContext Properties

| Property | Type | Description |
|----------|------|-------------|
| `context.token` | string | Authentication token from client |
| `context.headers` | object | HTTP request headers |
| `context.ip` | string | Client IP (`X-Real-IP`, `X-Forwarded-For`, or `remoteAddress`) |

### Custom Error Codes

```typescript
static async onAuth(token, options, context) {
  const user = await verify(token);
  if (!user) throw new ServerError(401, 'Invalid token');
  if (user.banned) throw new ServerError(403, 'Account banned');
  return user;
}
```

The `ServerError` code and message are exposed to the frontend.

## HTTP Middleware

Protect Express endpoints with auth:

```typescript
import { auth } from '@colyseus/auth';

// Using @colyseus/auth middleware
app.get('/profile', auth.middleware(), (req, res) => {
  // req.auth contains the decoded JWT payload
  res.json(req.auth);
});

app.post('/save-progress', auth.middleware(), (req, res) => {
  const userId = req.auth.id;
  // Save game progress...
});
```

### Custom Auth Middleware

```typescript
function customAuthMiddleware(req, res, next) {
  const authorization = req.headers.authorization;
  // Validate the token
  const user = verifyToken(authorization);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.auth = user;
  next();
}

app.get('/protected', customAuthMiddleware, (req, res) => {
  res.json(req.auth);
});
```

### Client HTTP Requests

The client automatically includes the auth token in HTTP requests:

```typescript
// Token is included automatically in Authorization header
const response = await client.http.get('/profile');
const data = await client.http.post('/save', { score: 100 });
```

## Account Linking

Upgrade anonymous accounts or link multiple OAuth providers:

```typescript
auth.settings.onRegisterWithEmailAndPassword = async (email, password, options) => {
  if (options.upgradingToken) {
    // User is upgrading from anonymous — link to existing account
    const existingUser = options.upgradingToken;
    return await db.users.update({
      where: { id: existingUser.id },
      data: { email, password, anonymous: false },
    });
  }

  return await db.users.create({ data: { email, password } });
};
```

## Email Templates

Customizable HTML templates stored in `/html` directory:

| File | Purpose |
|------|---------|
| `address-confirmation-email.html` | Email verification message |
| `address-confirmation.html` | Verification success page |
| `reset-password-email.html` | Password reset message |
| `reset-password-form.html` | Password reset form page |

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Unauthorized" on join | Token not set | Set `client.auth.token` before joining |
| OAuth redirect fails | Wrong `backend_url` | Set `auth.settings.backend_url` to public URL |
| Token expired | JWT expiration | Implement token refresh or re-auth |
| Missing env variables | `AUTH_SALT`, `JWT_SECRET`, or `SESSION_SECRET` not set | Add all 3 to `.env` |

## Additional Resources

- [Server & Room reference](../colyseus-server/SKILL.md)
- [Client SDK reference](../colyseus-client/SKILL.md)
- [Official Auth docs](https://docs.colyseus.io/auth/)
