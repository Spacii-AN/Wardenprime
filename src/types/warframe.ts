/**
 * Warframe API and game data type definitions
 */

export interface WarframeMission {
  Node: string;
  MissionType: string;
  Modifier: string;
  Hard: boolean;
  [key: string]: any;
}

export interface WarframeResponse {
  ActiveMissions: WarframeMission[];
}

export interface ActiveMission {
  _id: { $oid: string };
  Region?: number;
  Seed?: number;
  Activation?: { $date: { $numberLong: string } };
  Expiry: { $date: { $numberLong: string } } | string;
  Node: string;
  MissionType: string;
  Modifier: string;
  Hard: boolean;
  [key: string]: any;
}

export interface WarframeWorldState {
  ActiveMissions: ActiveMission[];
  [key: string]: any;
}

export interface RegionData {
  [nodeName: string]: {
    missionType: string;
    [key: string]: any;
  };
}

export interface FissureMission {
  node: string;
  missionType: string;
  tier: string;
  enemy: string;
  eta: string;
  isSteelPath: boolean;
}

/**
 * Helper function to extract expiry timestamp from ActiveMission
 */
export function getExpiryTimestamp(mission: ActiveMission): number {
  if (typeof mission.Expiry === 'string') {
    return new Date(mission.Expiry).getTime();
  } else if (mission.Expiry && typeof mission.Expiry === 'object' && '$date' in mission.Expiry) {
    return parseInt(mission.Expiry.$date.$numberLong);
  }
  return 0;
}
