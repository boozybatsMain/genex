# Character Movement Patterns

Common movement implementations using Rapier character controller.

## Jump with Coyote Time

```typescript
class JumpController {
  private coyoteTime = 0.15;  // seconds after leaving ground where jump still allowed
  private timeSinceGrounded = 0;
  private jumpBufferTime = 0.1;  // seconds before landing to buffer a jump
  private jumpBuffered = 0;
  private verticalVelocity = 0;
  private hasJumped = false;

  update(dt: number, jumpPressed: boolean, grounded: boolean) {
    // Track time since grounded
    if (grounded) {
      this.timeSinceGrounded = 0;
      this.hasJumped = false;
    } else {
      this.timeSinceGrounded += dt;
    }

    // Buffer jump input
    if (jumpPressed) {
      this.jumpBuffered = this.jumpBufferTime;
    } else {
      this.jumpBuffered = Math.max(0, this.jumpBuffered - dt);
    }

    // Execute jump
    const canJump = (grounded || this.timeSinceGrounded < this.coyoteTime) && !this.hasJumped;
    if (this.jumpBuffered > 0 && canJump) {
      this.verticalVelocity = 8; // jump strength
      this.hasJumped = true;
      this.jumpBuffered = 0;
      this.timeSinceGrounded = this.coyoteTime; // prevent double jump
    }

    // Gravity
    if (!grounded) {
      this.verticalVelocity -= 20 * dt;
    } else if (this.verticalVelocity < 0) {
      this.verticalVelocity = 0;
    }

    return this.verticalVelocity * dt;
  }
}
```

## Variable Jump Height (Hold to Jump Higher)

```typescript
class VariableJumpController {
  private verticalVelocity = 0;
  private isJumping = false;
  private jumpHoldTime = 0;
  private maxJumpHoldTime = 0.2;  // seconds to hold for max height
  private initialJumpForce = 6;
  private sustainedJumpForce = 12;

  update(dt: number, jumpHeld: boolean, grounded: boolean) {
    if (grounded && jumpHeld && !this.isJumping) {
      // Start jump
      this.verticalVelocity = this.initialJumpForce;
      this.isJumping = true;
      this.jumpHoldTime = 0;
    } else if (this.isJumping && jumpHeld && this.jumpHoldTime < this.maxJumpHoldTime) {
      // Sustain jump while held
      this.jumpHoldTime += dt;
      this.verticalVelocity += this.sustainedJumpForce * dt;
    }

    // Release tracking
    if (!jumpHeld || this.jumpHoldTime >= this.maxJumpHoldTime) {
      this.isJumping = false;
    }

    // Reset on ground
    if (grounded && !jumpHeld) {
      this.isJumping = false;
    }

    // Gravity (stronger when falling for snappier feel)
    const gravityScale = this.verticalVelocity < 0 ? 2.5 : 1.0;
    this.verticalVelocity -= 20 * gravityScale * dt;

    return this.verticalVelocity * dt;
  }
}
```

## Dash

```typescript
class DashController {
  private isDashing = false;
  private dashDuration = 0.15;
  private dashCooldown = 0.5;
  private dashSpeed = 20;
  private dashTimer = 0;
  private cooldownTimer = 0;
  private dashDirection = { x: 0, z: 0 };

  update(dt: number, dashPressed: boolean, facingDirection: { x: number; z: number }) {
    // Cooldown
    this.cooldownTimer = Math.max(0, this.cooldownTimer - dt);

    // Start dash
    if (dashPressed && !this.isDashing && this.cooldownTimer <= 0) {
      this.isDashing = true;
      this.dashTimer = this.dashDuration;
      this.cooldownTimer = this.dashCooldown;
      // Normalize direction
      const len = Math.sqrt(facingDirection.x ** 2 + facingDirection.z ** 2);
      this.dashDirection = len > 0
        ? { x: facingDirection.x / len, z: facingDirection.z / len }
        : { x: 0, z: 1 };
    }

    // During dash
    if (this.isDashing) {
      this.dashTimer -= dt;
      if (this.dashTimer <= 0) {
        this.isDashing = false;
      }
      return {
        x: this.dashDirection.x * this.dashSpeed * dt,
        z: this.dashDirection.z * this.dashSpeed * dt,
        active: true,
      };
    }

    return { x: 0, z: 0, active: false };
  }
}
```

## Ground Pound / Fast Fall

```typescript
class GroundPoundController {
  private isPounding = false;
  private poundSpeed = 30;
  private normalGravity = 20;

  update(dt: number, poundPressed: boolean, grounded: boolean, verticalVelocity: number) {
    if (grounded) {
      if (this.isPounding) {
        // Landing impact - trigger effects here
        this.isPounding = false;
      }
      return 0;
    }

    // Initiate ground pound
    if (poundPressed && !this.isPounding && verticalVelocity < 0) {
      this.isPounding = true;
    }

    if (this.isPounding) {
      return -this.poundSpeed * dt;
    }

    return null; // Use normal gravity
  }
}
```

## Wall Slide & Wall Jump

```typescript
class WallSlideController {
  private isWallSliding = false;
  private wallSlideSpeed = 2;
  private wallJumpForce = { x: 8, y: 10 };
  private wallDirection = 0; // -1 left, 1 right

  checkWallContact(controller: RAPIER.KinematicCharacterController): { touching: boolean; direction: number } {
    for (let i = 0; i < controller.numComputedCollisions(); i++) {
      const collision = controller.computedCollision(i);
      if (collision) {
        const normal = collision.normal1;
        // Check if collision is horizontal (wall)
        if (Math.abs(normal.y) < 0.3) {
          return {
            touching: true,
            direction: normal.x > 0 ? -1 : 1, // Wall is opposite of normal
          };
        }
      }
    }
    return { touching: false, direction: 0 };
  }

  update(
    dt: number,
    grounded: boolean,
    horizontalInput: number,
    jumpPressed: boolean,
    wallContact: { touching: boolean; direction: number },
    currentVerticalVelocity: number
  ) {
    // Can only wall slide when:
    // - Not grounded
    // - Touching wall
    // - Falling (negative vertical velocity)
    // - Pressing toward wall
    const pressingTowardWall = wallContact.direction !== 0 &&
      Math.sign(horizontalInput) === wallContact.direction;

    this.isWallSliding = !grounded &&
      wallContact.touching &&
      currentVerticalVelocity < 0 &&
      pressingTowardWall;

    if (this.isWallSliding) {
      this.wallDirection = wallContact.direction;

      // Wall jump
      if (jumpPressed) {
        this.isWallSliding = false;
        return {
          horizontalVelocity: -this.wallDirection * this.wallJumpForce.x,
          verticalVelocity: this.wallJumpForce.y,
          jumped: true,
        };
      }

      // Slow descent
      return {
        verticalVelocity: -this.wallSlideSpeed,
        sliding: true,
      };
    }

    return { sliding: false, jumped: false };
  }
}
```

## Smooth Acceleration/Deceleration

```typescript
class SmoothMovement {
  private velocity = { x: 0, z: 0 };
  private maxSpeed = 6;
  private acceleration = 40;
  private deceleration = 30;
  private airAcceleration = 15;

  update(dt: number, input: { x: number; z: number }, grounded: boolean) {
    const accel = grounded ? this.acceleration : this.airAcceleration;
    const decel = this.deceleration;

    // X axis
    if (input.x !== 0) {
      this.velocity.x += input.x * accel * dt;
    } else {
      // Decelerate toward zero
      if (Math.abs(this.velocity.x) < decel * dt) {
        this.velocity.x = 0;
      } else {
        this.velocity.x -= Math.sign(this.velocity.x) * decel * dt;
      }
    }

    // Z axis
    if (input.z !== 0) {
      this.velocity.z += input.z * accel * dt;
    } else {
      if (Math.abs(this.velocity.z) < decel * dt) {
        this.velocity.z = 0;
      } else {
        this.velocity.z -= Math.sign(this.velocity.z) * decel * dt;
      }
    }

    // Clamp to max speed
    const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    if (speed > this.maxSpeed) {
      const scale = this.maxSpeed / speed;
      this.velocity.x *= scale;
      this.velocity.z *= scale;
    }

    return {
      x: this.velocity.x * dt,
      z: this.velocity.z * dt,
    };
  }
}
```

## Moving Platforms

```typescript
class PlatformFollower {
  private lastPlatformPosition: { x: number; y: number; z: number } | null = null;
  private currentPlatform: RAPIER.Collider | null = null;

  update(controller: RAPIER.KinematicCharacterController, grounded: boolean) {
    let platformDelta = { x: 0, y: 0, z: 0 };

    if (!grounded) {
      this.currentPlatform = null;
      this.lastPlatformPosition = null;
      return platformDelta;
    }

    // Find ground collision
    for (let i = 0; i < controller.numComputedCollisions(); i++) {
      const collision = controller.computedCollision(i);
      if (collision && collision.normal1.y > 0.7) {
        // Standing on this collider
        const platform = collision.collider;
        const body = platform.parent();

        if (body && body.bodyType() === RAPIER.RigidBodyType.KinematicPositionBased) {
          const pos = body.translation();

          if (this.currentPlatform === platform && this.lastPlatformPosition) {
            // Calculate platform movement
            platformDelta = {
              x: pos.x - this.lastPlatformPosition.x,
              y: pos.y - this.lastPlatformPosition.y,
              z: pos.z - this.lastPlatformPosition.z,
            };
          }

          this.currentPlatform = platform;
          this.lastPlatformPosition = { x: pos.x, y: pos.y, z: pos.z };
          break;
        }
      }
    }

    // Lost platform contact
    if (this.currentPlatform) {
      let stillOnPlatform = false;
      for (let i = 0; i < controller.numComputedCollisions(); i++) {
        if (controller.computedCollision(i)?.collider === this.currentPlatform) {
          stillOnPlatform = true;
          break;
        }
      }
      if (!stillOnPlatform) {
        this.currentPlatform = null;
        this.lastPlatformPosition = null;
      }
    }

    return platformDelta;
  }
}
```

## Integration Example

```typescript
function updateCharacter(
  dt: number,
  input: { x: number; z: number; jump: boolean; dash: boolean },
  controller: RAPIER.KinematicCharacterController,
  collider: RAPIER.Collider,
  body: RAPIER.RigidBody,
  jumpCtrl: JumpController,
  dashCtrl: DashController,
  moveCtrl: SmoothMovement,
  platformCtrl: PlatformFollower
) {
  const grounded = controller.computedGrounded();

  // Get movement components
  const horizontalMove = moveCtrl.update(dt, input, grounded);
  const verticalMove = jumpCtrl.update(dt, input.jump, grounded);
  const dash = dashCtrl.update(dt, input.dash, { x: input.x, z: input.z });
  const platformMove = platformCtrl.update(controller, grounded);

  // Combine movement
  const movement = {
    x: (dash.active ? dash.x : horizontalMove.x) + platformMove.x,
    y: verticalMove + platformMove.y,
    z: (dash.active ? dash.z : horizontalMove.z) + platformMove.z,
  };

  // Compute collision-adjusted movement
  controller.computeColliderMovement(collider, movement);
  const corrected = controller.computedMovement();

  // Apply
  const pos = body.translation();
  body.setNextKinematicTranslation({
    x: pos.x + corrected.x,
    y: pos.y + corrected.y,
    z: pos.z + corrected.z,
  });
}
```
