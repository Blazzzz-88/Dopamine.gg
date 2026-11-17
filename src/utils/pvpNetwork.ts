import { RealtimeChannel } from '@supabase/supabase-js';
import { RarityId } from '../types/casino';
import { generatePvpRoomCode } from './pvpEngine';
import { supabase } from './supabaseClient';

export interface PvpPlayerProfile {
  clientId: string;
  name: string;
  weaponName: string;
  skinName: string;
  rarity: RarityId;
  swatches: [string, string, string];
  isMelee: boolean;
}

export interface PvpStatePacket {
  clientId: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  isMoving: boolean;
  isMelee: boolean;
}

export interface PvpShootPacket {
  clientId: string;
  origin: [number, number, number];
  dir: [number, number, number];
  hitTarget: boolean;
  hitPart?: 'head' | 'body';
  damage?: number;
  round: number;
}

export interface PvpRoundPacket {
  clientId: string;
  action: 'round_start' | 'round_win' | 'rematch_vote';
  round: number;
  winnerId?: string;
}

export interface LobbySession {
  leave: () => void;
}

export interface PvpRoomSession {
  sendHello: (profile: PvpPlayerProfile) => void;
  sendState: (state: PvpStatePacket) => void;
  sendShoot: (shoot: PvpShootPacket) => void;
  sendRoundControl: (pkt: PvpRoundPacket) => void;
  leave: () => void;
}

interface LobbyPresenceEntry {
  clientId: string;
  playerName: string;
  weaponLabel: string;
  status: 'waiting' | 'matched';
  joinedAt: number;
}

/**
 * Joins the global Supabase Realtime 1v1 matchmaking lobby.
 * Automatically pairs two waiting players into a deterministic private room.
 */
export function joinPvpLobby(
  clientId: string,
  playerName: string,
  weaponLabel: string,
  onWaitingCount: (count: number) => void,
  onMatched: (roomCode: string, isHost: boolean) => void
): LobbySession {
  let closed = false;
  let matched = false;

  const channel: RealtimeChannel = supabase.channel('pvp-1v1-lobby', {
    config: {
      presence: { key: clientId },
      broadcast: { self: true },
    },
  });

  const handleMatchOnce = (roomCode: string, isHost: boolean) => {
    if (closed || matched) return;
    matched = true;
    void channel.track({
      clientId,
      playerName,
      weaponLabel,
      status: 'matched',
      joinedAt: Date.now(),
    });
    onMatched(roomCode, isHost);
  };

  channel.on('broadcast', { event: 'match_invite' }, ({ payload }) => {
    if (!payload || closed || matched) return;
    if (payload.hostId === clientId) {
      handleMatchOnce(payload.roomCode, true);
    } else if (payload.guestId === clientId) {
      handleMatchOnce(payload.roomCode, false);
    }
  });

  channel.on('presence', { event: 'sync' }, () => {
    if (closed || matched) return;
    const state = channel.presenceState<LobbyPresenceEntry>();
    const waiting: LobbyPresenceEntry[] = [];
    for (const entries of Object.values(state)) {
      for (const entry of entries) {
        if (entry && entry.status === 'waiting') {
          waiting.push(entry);
        }
      }
    }
    onWaitingCount(waiting.length);

    if (waiting.length >= 2) {
      waiting.sort((a, b) => a.clientId.localeCompare(b.clientId));
      if (waiting[0].clientId === clientId) {
        const guest = waiting[1];
        const roomCode = `QM-${generatePvpRoomCode()}`;
        void channel.send({
          type: 'broadcast',
          event: 'match_invite',
          payload: {
            hostId: clientId,
            guestId: guest.clientId,
            roomCode,
          },
        });
      }
    }
  });

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED' && !closed) {
      void channel.track({
        clientId,
        playerName,
        weaponLabel,
        status: 'waiting',
        joinedAt: Date.now(),
      });
    }
  });

  return {
    leave: () => {
      closed = true;
      void supabase.removeChannel(channel);
    },
  };
}

export interface PvpRoomCallbacks {
  onStatusChange: (status: 'connecting' | 'waiting_opponent' | 'connected') => void;
  onOpponentHello: (profile: PvpPlayerProfile) => void;
  onOpponentState: (state: PvpStatePacket) => void;
  onOpponentShoot: (shoot: PvpShootPacket) => void;
  onRoundControl: (pkt: PvpRoundPacket) => void;
  onOpponentLeft: () => void;
}

/**
 * Joins a dedicated 1v1 Supabase Realtime match room for two players.
 */
export function joinPvpRoom(
  roomCode: string,
  clientId: string,
  localProfile: PvpPlayerProfile,
  callbacks: PvpRoomCallbacks
): PvpRoomSession {
  let closed = false;
  let hadOpponent = false;
  let lastOpponentCount = 0;

  callbacks.onStatusChange('connecting');

  const channel: RealtimeChannel = supabase.channel(`pvp-1v1-room-${roomCode}`, {
    config: {
      presence: { key: clientId },
      broadcast: { self: false },
    },
  });

  const sendHello = (profile: PvpPlayerProfile) => {
    if (closed) return;
    void channel.send({
      type: 'broadcast',
      event: 'hello',
      payload: profile,
    });
  };

  channel.on('broadcast', { event: 'hello' }, ({ payload }) => {
    if (closed || !payload || payload.clientId === clientId) return;
    callbacks.onOpponentHello(payload as PvpPlayerProfile);
  });

  channel.on('broadcast', { event: 'state' }, ({ payload }) => {
    if (closed || !payload || payload.clientId === clientId) return;
    callbacks.onOpponentState(payload as PvpStatePacket);
  });

  channel.on('broadcast', { event: 'shoot' }, ({ payload }) => {
    if (closed || !payload || payload.clientId === clientId) return;
    callbacks.onOpponentShoot(payload as PvpShootPacket);
  });

  channel.on('broadcast', { event: 'round_control' }, ({ payload }) => {
    if (closed || !payload || payload.clientId === clientId) return;
    callbacks.onRoundControl(payload as PvpRoundPacket);
  });

  channel.on('presence', { event: 'sync' }, () => {
    if (closed) return;
    const state = channel.presenceState<{ clientId: string }>();
    const otherIds = Object.keys(state).filter((key) => key !== clientId);

    if (otherIds.length > 0) {
      hadOpponent = true;
      if (lastOpponentCount === 0) {
        callbacks.onStatusChange('connected');
        sendHello(localProfile);
      }
    } else {
      if (hadOpponent) {
        callbacks.onOpponentLeft();
      } else {
        callbacks.onStatusChange('waiting_opponent');
      }
    }
    lastOpponentCount = otherIds.length;
  });

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED' && !closed) {
      callbacks.onStatusChange('waiting_opponent');
      void channel.track({ clientId, joinedAt: Date.now() });
      sendHello(localProfile);
    }
  });

  return {
    sendHello,
    sendState: (st) => {
      if (closed) return;
      void channel.send({ type: 'broadcast', event: 'state', payload: st });
    },
    sendShoot: (shoot) => {
      if (closed) return;
      void channel.send({ type: 'broadcast', event: 'shoot', payload: shoot });
    },
    sendRoundControl: (pkt) => {
      if (closed) return;
      void channel.send({ type: 'broadcast', event: 'round_control', payload: pkt });
    },
    leave: () => {
      closed = true;
      void supabase.removeChannel(channel);
    },
  };
}
