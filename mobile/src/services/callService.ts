import { api } from '../config/api';

export type CallType = 'AUDIO' | 'VIDEO';
export type CallStatus = 'RINGING' | 'ACCEPTED' | 'REJECTED' | 'BUSY' | 'ENDED';

export interface CallSession {
  id: number;
  room_id: string;
  caller: number;
  caller_name: string;
  caller_email: string;
  receiver: number;
  receiver_name: string;
  receiver_email: string;
  call_type: CallType;
  status: CallStatus;
  sdp_offer?: string;
  sdp_answer?: string;
  created_at: string;
  ended_at: string | null;
}

export interface InitiateCallPayload {
  receiver_id?: number;
  receiver_email?: string;
  call_type: CallType;
  sdp_offer?: string;
}

export const callService = {
  // 1. Initiate Audio or Video Call
  async initiateCall(payload: InitiateCallPayload): Promise<CallSession> {
    const res = await api.post('/calls/initiate/', payload);
    return res.data;
  },

  // 2. Answer Incoming Call
  async answerCall(roomId: string, sdpAnswer = 'mock-sdp-answer'): Promise<CallSession> {
    const res = await api.post(`/calls/${roomId}/answer/`, {
      sdp_answer: sdpAnswer,
    });
    return res.data;
  },

  // 3. Poll Call Status
  async getCallStatus(roomId: string): Promise<CallSession> {
    const res = await api.get(`/calls/${roomId}/status/`);
    return res.data;
  },

  // 4. Terminate / Hang up Call
  async endCall(roomId: string): Promise<{ message: string; room_id: string }> {
    const res = await api.post(`/calls/${roomId}/end/`);
    return res.data;
  },

  // 5. Get current active/ringing calls for user
  async getActiveCalls(): Promise<CallSession[]> {
    const res = await api.get('/calls/active/');
    return res.data;
  },
};
