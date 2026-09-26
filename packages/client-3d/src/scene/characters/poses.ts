/**
 * Joint angles for a kid, as a pure function of what they are doing and the time. Kept
 * apart from the mesh so every kid in the room — player, eater, or background — moves
 * through the same small vocabulary of motions.
 *
 * Kid-local axes: the kid faces +Z, and their right hand is on -X.
 */

export type Pose = "stand" | "walk" | "sit";

export type Animation =
  | "idle"
  | "eat"
  | "chat"
  | "listen"
  | "think"
  | "wave"
  | "cheer"
  | "slump"
  | "carry"
  | "serve"
  | "hungry"
  | "chomp";

export interface Joints {
  bodyLift: number;
  torsoPitch: number;
  torsoRoll: number;
  headPitch: number;
  headYaw: number;
  headRoll: number;
  rightShoulderPitch: number;
  rightShoulderRoll: number;
  rightElbow: number;
  leftShoulderPitch: number;
  leftShoulderRoll: number;
  leftElbow: number;
  rightHip: number;
  rightKnee: number;
  leftHip: number;
  leftKnee: number;
  /** 0 closed (a smile line) to 1 wide open. */
  mouthOpen: number;
  /** 1 open, 0 shut — for blinks. */
  eyeOpen: number;
}

const REST: Joints = {
  bodyLift: 0,
  torsoPitch: 0,
  torsoRoll: 0,
  headPitch: 0,
  headYaw: 0,
  headRoll: 0,
  rightShoulderPitch: 0,
  rightShoulderRoll: -0.1,
  rightElbow: 0,
  leftShoulderPitch: 0,
  leftShoulderRoll: 0.1,
  leftElbow: 0,
  rightHip: 0,
  rightKnee: 0,
  leftHip: 0,
  leftKnee: 0,
  mouthOpen: 0,
  eyeOpen: 1,
};

/** Seated: thighs forward, shins hanging. */
const SEATED_LEGS = { rightHip: -Math.PI / 2, leftHip: -Math.PI / 2, rightKnee: Math.PI / 2 - 0.1, leftKnee: Math.PI / 2 - 0.1 };

/** Forearms resting on the table edge. */
const ARMS_ON_TABLE = {
  rightShoulderPitch: -0.55,
  leftShoulderPitch: -0.55,
  rightElbow: -1.0,
  leftElbow: -1.0,
  rightShoulderRoll: -0.05,
  leftShoulderRoll: 0.05,
};

/** Standing: arms loose at the sides, elbows soft. */
const ARMS_RELAXED = {
  rightShoulderPitch: 0,
  leftShoulderPitch: 0,
  rightElbow: -0.15,
  leftElbow: -0.15,
  rightShoulderRoll: -0.1,
  leftShoulderRoll: 0.1,
};

/** Smooth 0..1 pulse that stays at 1 through the middle of each cycle. */
function plateau(cycle: number): number {
  const fraction = cycle - Math.floor(cycle);
  if (fraction < 0.2) return smoothstep(fraction / 0.2);
  if (fraction < 0.55) return 1;
  if (fraction < 0.75) return 1 - smoothstep((fraction - 0.55) / 0.2);
  return 0;
}

function smoothstep(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

/** Cheap, smooth, deterministic wandering in -1..1. */
function wander(time: number, phase: number): number {
  return Math.sin(time * 0.37 + phase * 11.3) * 0.6 + Math.sin(time * 0.91 + phase * 5.1) * 0.4;
}

function blink(time: number, phase: number): number {
  const period = 3.2 + (phase % 1) * 2.4;
  const fraction = ((time + phase * 7) % period) / period;
  return fraction > 0.965 ? 0.1 : 1;
}

export function computeJoints(pose: Pose, animation: Animation, time: number, phase: number): Joints {
  const local = time + phase * 10;
  const joints: Joints = { ...REST, eyeOpen: blink(time, phase) };

  // Breathing and a gentle look around, under everything else.
  joints.bodyLift = Math.sin(local * 1.8) * 0.004;
  joints.headYaw = wander(local, phase) * 0.25;
  joints.headPitch = Math.sin(local * 0.6) * 0.04;

  if (pose === "sit") Object.assign(joints, SEATED_LEGS);

  if (pose === "walk") {
    const stride = local * 7.5;
    joints.rightHip = Math.sin(stride) * 0.55;
    joints.leftHip = -Math.sin(stride) * 0.55;
    joints.rightKnee = Math.max(0, -Math.sin(stride - 0.6)) * 0.7;
    joints.leftKnee = Math.max(0, Math.sin(stride - 0.6)) * 0.7;
    joints.rightShoulderPitch = -Math.sin(stride) * 0.45;
    joints.leftShoulderPitch = Math.sin(stride) * 0.45;
    joints.rightElbow = -0.25;
    joints.leftElbow = -0.25;
    joints.bodyLift = Math.abs(Math.cos(stride)) * 0.03;
    joints.headYaw *= 0.4;
  }

  // Walking keeps its arm swing; otherwise arms start from the table or the sides.
  const arms = pose === "sit" ? ARMS_ON_TABLE : pose === "stand" ? ARMS_RELAXED : {};
  Object.assign(joints, arms);
  const base = { ...REST, ...arms };

  switch (animation) {
    case "idle":
      break;

    case "eat": {
      // Fork up to the mouth, a few chews, back down to the tray.
      const lift = plateau(local * 0.33);
      joints.rightShoulderPitch = -0.55 - lift * 0.75;
      joints.rightElbow = -1.0 - lift * 1.15;
      joints.rightShoulderRoll = -0.05 + lift * 0.3;
      joints.headPitch = 0.12 - lift * 0.1;
      joints.headYaw *= 0.3;
      joints.mouthOpen = lift > 0.95 ? Math.abs(Math.sin(local * 9)) * 0.35 : 0;
      break;
    }

    case "chat": {
      // Talk in bursts, with the occasional hand gesture.
      const talking = Math.sin(local * 0.8) > -0.2;
      joints.mouthOpen = talking ? Math.max(0, Math.sin(local * 11)) * 0.55 : 0;
      const gesture = plateau(local * 0.21 + 0.4);
      joints.leftShoulderPitch = base.leftShoulderPitch - gesture * 0.5;
      joints.leftElbow = base.leftElbow - gesture * (pose === "sit" ? 0.5 : 1.3);
      joints.leftShoulderRoll = base.leftShoulderRoll + gesture * (0.2 + Math.sin(local * 4) * 0.12);
      joints.headRoll = Math.sin(local * 1.3) * 0.06;
      joints.torsoRoll = Math.sin(local * 0.7) * 0.03;
      break;
    }

    case "listen": {
      // Nods, and the odd laugh that rocks the shoulders.
      const laughing = plateau(local * 0.15) > 0.5;
      joints.headPitch = Math.sin(local * 3.1) * 0.06 + (laughing ? -0.12 : 0);
      joints.mouthOpen = laughing ? 0.45 + Math.sin(local * 14) * 0.15 : 0;
      joints.torsoPitch = laughing ? -0.06 + Math.sin(local * 14) * 0.02 : 0;
      break;
    }

    case "think": {
      // Chin in hand, eyes on the trays, the odd glance across the table.
      const glance = plateau(local * 0.12);
      joints.rightShoulderPitch = -1.05;
      joints.rightShoulderRoll = 0.28;
      joints.rightElbow = -2.05;
      joints.headPitch = 0.3 - glance * 0.3;
      joints.headRoll = 0.12;
      joints.headYaw = -0.1 + glance * 0.1;
      joints.leftElbow = base.leftElbow - Math.max(0, Math.sin(local * 1.4)) * 0.1;
      break;
    }

    case "wave": {
      joints.rightShoulderPitch = -0.3;
      joints.rightShoulderRoll = -2.5;
      joints.rightElbow = -0.4 + Math.sin(local * 8) * 0.35;
      joints.mouthOpen = 0.3;
      joints.headRoll = -0.08;
      break;
    }

    case "cheer": {
      const bounce = Math.abs(Math.sin(local * 6));
      joints.rightShoulderRoll = -2.7 + Math.sin(local * 6) * 0.15;
      joints.leftShoulderRoll = 2.7 - Math.sin(local * 6) * 0.15;
      joints.rightElbow = -0.25;
      joints.leftElbow = -0.25;
      joints.bodyLift = bounce * (pose === "sit" ? 0.05 : 0.1);
      joints.headPitch = -0.18;
      joints.headYaw = Math.sin(local * 3) * 0.15;
      joints.mouthOpen = 0.75;
      break;
    }

    case "slump": {
      joints.torsoPitch = 0.22;
      joints.headPitch = 0.38;
      joints.headYaw = Math.sin(local * 0.4) * 0.08;
      joints.rightElbow = -1.25;
      joints.leftElbow = -1.25;
      break;
    }

    case "carry":
      joints.rightShoulderPitch = -0.55;
      joints.leftShoulderPitch = -0.55;
      joints.rightElbow = -1.05;
      joints.leftElbow = -1.05;
      joints.rightShoulderRoll = 0.12;
      joints.leftShoulderRoll = -0.12;
      break;

    case "serve": {
      // Scoop from the pan, turn, and hand it over the counter.
      const scoop = plateau(local * 0.4);
      joints.rightShoulderPitch = -0.5 - scoop * 0.7;
      joints.rightElbow = -1.2 + scoop * 0.6;
      joints.leftShoulderPitch = -0.4;
      joints.leftElbow = -1.3;
      joints.torsoPitch = 0.1 - scoop * 0.1;
      joints.torsoRoll = Math.sin(local * 0.4 * Math.PI * 2) * 0.05;
      joints.mouthOpen = scoop > 0.9 ? 0.25 : 0;
      break;
    }

    case "hungry": {
      // The eater: fork and knife up, rocking with anticipation, eyes on the food.
      joints.rightShoulderPitch = -0.7;
      joints.leftShoulderPitch = -0.7;
      joints.rightElbow = -1.05 + Math.sin(local * 5) * 0.08;
      joints.leftElbow = -1.05 - Math.sin(local * 5) * 0.08;
      joints.torsoRoll = Math.sin(local * 2.4) * 0.05;
      joints.headRoll = Math.sin(local * 2.4) * 0.08;
      joints.headYaw = Math.sin(local * 0.5) * 0.35;
      joints.headPitch = 0.1;
      break;
    }

    case "chomp": {
      joints.rightShoulderPitch = -0.9;
      joints.leftShoulderPitch = -0.9;
      joints.rightElbow = -1.3;
      joints.leftElbow = -1.3;
      joints.torsoPitch = 0.18;
      joints.headPitch = 0.05 + Math.sin(local * 16) * 0.06;
      joints.headYaw = 0;
      joints.mouthOpen = 0.35 + Math.abs(Math.sin(local * 16)) * 0.65;
      break;
    }
  }

  return joints;
}
