import { LIMITS, type NearbyUser } from "@spark/shared";
import { HEARTBEAT_TIMEOUT_MS } from "../config.js";

type Located = { id: string; profile: NearbyUser["profile"]; raw: {lat:number;lng:number}; lastSeen: number; stableOffset: {lat:number;lng:number} };
const earth = 6_371_000;
const radians = (d:number) => d * Math.PI / 180;
export const distanceMeters = (a:{lat:number;lng:number}, b:{lat:number;lng:number}) => { const dLat=radians(b.lat-a.lat), dLng=radians(b.lng-a.lng); const h=Math.sin(dLat/2)**2+Math.cos(radians(a.lat))*Math.cos(radians(b.lat))*Math.sin(dLng/2)**2; return 2*earth*Math.asin(Math.sqrt(h)); };
export class LocationService {
  private users = new Map<string, Located>();
  update(id:string, profile:NearbyUser["profile"], raw:{lat:number;lng:number}) { if (!Number.isFinite(raw.lat)||!Number.isFinite(raw.lng)||Math.abs(raw.lat)>90||Math.abs(raw.lng)>180) throw new Error("Invalid location"); const current=this.users.get(id); const seed = current?.stableOffset ?? this.offset(id); this.users.set(id,{id,profile,raw,lastSeen:Date.now(),stableOffset:seed}); }
  nearby(viewerId:string) { const viewer=this.users.get(viewerId); if (!viewer) return [] as NearbyUser[]; this.expire(); return [...this.users.values()].filter(u=>u.id!==viewerId && distanceMeters(viewer.raw,u.raw)<=LIMITS.discoveryMeters).map(u=>({id:u.id,profile:u.profile,position:{lat:u.raw.lat+u.stableOffset.lat,lng:u.raw.lng+u.stableOffset.lng}})); }
  remove(id:string) { this.users.delete(id); }
  expire(now=Date.now()) { for (const [id,u] of this.users) if(now-u.lastSeen>HEARTBEAT_TIMEOUT_MS) this.users.delete(id); }
  private offset(id:string) { let h=0; for(const c of id) h=(h*31+c.charCodeAt(0))>>>0; const angle=(h%360)*Math.PI/180, magnitude=0.00032 + ((h>>>8)%100)/1_000_000; return {lat:Math.cos(angle)*magnitude,lng:Math.sin(angle)*magnitude}; }
}
