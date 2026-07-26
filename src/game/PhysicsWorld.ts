import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { GameConfig } from "./config";

export type PhysicsBodyHandle = {
  rigidBody: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  mesh?: THREE.Object3D;
};

export class PhysicsWorld {
  world!: RAPIER.World;
  private eventQueue!: RAPIER.EventQueue;
  private ready = false;
  private bodies: PhysicsBodyHandle[] = [];

  async init(): Promise<void> {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: GameConfig.gravity, z: 0 });
    this.world.timestep = 1 / 60;
    this.eventQueue = new RAPIER.EventQueue(true);
    this.ready = true;
  }

  get isReady(): boolean {
    return this.ready;
  }

  step(): void {
    this.world.step(this.eventQueue);
  }

  createStaticBox(
    position: THREE.Vector3,
    halfExtents: THREE.Vector3,
    rotation?: THREE.Quaternion,
  ): PhysicsBodyHandle {
    const desc = RAPIER.RigidBodyDesc.fixed().setTranslation(
      position.x,
      position.y,
      position.z,
    );
    if (rotation) {
      desc.setRotation({
        x: rotation.x,
        y: rotation.y,
        z: rotation.z,
        w: rotation.w,
      });
    }
    const rigidBody = this.world.createRigidBody(desc);
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
        .setFriction(0.7)
        .setRestitution(0)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min),
      rigidBody,
    );
    const handle = { rigidBody, collider };
    this.bodies.push(handle);
    return handle;
  }

  createKinematicBox(
    position: THREE.Vector3,
    halfExtents: THREE.Vector3,
  ): PhysicsBodyHandle {
    const rigidBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        position.x,
        position.y,
        position.z,
      ),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
        .setFriction(0.85)
        .setRestitution(0)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min),
      rigidBody,
    );
    const handle = { rigidBody, collider };
    this.bodies.push(handle);
    return handle;
  }

  createPlayerCapsule(position: THREE.Vector3): PhysicsBodyHandle {
    const rigidBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setCanSleep(false)
        .setCcdEnabled(true)
        .setSoftCcdPrediction(0.4)
        .setLinearDamping(0)
        .setAngularDamping(1)
        .lockRotations(),
    );
    const halfHeight =
      (GameConfig.playerHeight - GameConfig.playerRadius * 2) / 2;
    // Near-zero friction + Min combine → no sticky walls; we drive XZ ourselves.
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(
        Math.max(halfHeight, 0.05),
        GameConfig.playerRadius,
      )
        .setFriction(0)
        .setRestitution(0)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setDensity(2.8),
      rigidBody,
    );
    const handle = { rigidBody, collider };
    this.bodies.push(handle);
    return handle;
  }

  setKinematicPose(
    body: RAPIER.RigidBody,
    position: THREE.Vector3,
    rotation?: THREE.Quaternion,
  ): void {
    body.setNextKinematicTranslation({
      x: position.x,
      y: position.y,
      z: position.z,
    });
    if (rotation) {
      body.setNextKinematicRotation({
        x: rotation.x,
        y: rotation.y,
        z: rotation.z,
        w: rotation.w,
      });
    }
  }

  dispose(): void {
    if (!this.ready) return;
    this.world.free();
    this.eventQueue.free();
    this.bodies = [];
    this.ready = false;
  }
}
