// Pose coordinates use body +X along the board's anatomical nose. Switch
// reverses front/back roles while retaining the rider's toe and heel edges.
// Reflect longitudinal positions and swap anatomical limbs, not the root frame.
export function mirrorSwitchPose(pose) {
  for (const suffix of ['Hip','Knee','Elbow','ArmX','ArmZ','LegZ']) {
    const left='l'+suffix,right='r'+suffix;
    if (!(left in pose) && !(right in pose)) continue;
    const sign=suffix.endsWith('Z')?-1:1;
    const l=pose[left]??0,r=pose[right]??0;
    pose[left]=r*sign;pose[right]=l*sign;
  }
  for (const key of ['headY','torsoY','torsoZ','hipsYaw','hipsZ','hipsSide'])
    if (key in pose) pose[key]=-pose[key];
  return pose;
}
