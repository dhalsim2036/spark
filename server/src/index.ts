import "dotenv/config";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { Server } from "socket.io";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AVATARS, LIMITS, type TemporaryProfile } from "@spark/shared";
import { CLIENT_ORIGIN, PORT, MESSAGE_LIMIT, REQUEST_LIMIT } from "./config.js";
import { LocationService } from "./services/location.service.js";
import { ChatService } from "./services/chat.service.js";

const corsOrigin = CLIENT_ORIGIN ?? true;
const app=express(); app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],baseUri:["'self'"],fontSrc:["'self'","https://fonts.gstatic.com","data:"],formAction:["'self'"],frameAncestors:["'self'"],imgSrc:["'self'","data:","blob:","https://*.tile.openstreetmap.org"],objectSrc:["'none'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'","https://fonts.googleapis.com"],upgradeInsecureRequests:[]}}})); app.use(cors({origin:corsOrigin,methods:["GET","POST"]})); app.use(express.json({limit:"32kb"})); app.get("/health",(_,res)=>res.json({ok:true}));
const clientDist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../client/dist");
if(existsSync(clientDist)){ app.use(express.static(clientDist)); app.get("*",(_,res)=>res.sendFile(path.join(clientDist,"index.html"))); }
const http=createServer(app); const io=new Server(http,{cors:{origin:corsOrigin,methods:["GET","POST"]}});
const locations=new LocationService(), chats=new ChatService(); const profiles=new Map<string,TemporaryProfile>(); const sockets=new Map<string,string>();
const profileSchema=z.object({displayName:z.string().trim().min(1).max(LIMITS.displayName),avatar:z.string().refine(v=>(AVATARS as readonly string[]).includes(v)),gender:z.enum(["woman","man","nonbinary","self_describe"]).optional()});
const limits=new Map<string,{count:number;at:number}>();
function rate(id:string,type:"request"|"message"){const c=type==="request"?REQUEST_LIMIT:MESSAGE_LIMIT,k=`${id}:${type}`, now=Date.now(), p=limits.get(k);if(!p||now-p.at>c.windowMs){limits.set(k,{count:1,at:now});return;}if(++p.count>c.count)throw new Error("Please slow down.");}
function emitNearby(){for(const [id,socketId] of sockets)io.to(socketId).emit("nearby:update",locations.nearby(id));}
function safe<T>(fn:()=>T){try{return fn()}catch(e){throw new Error(e instanceof Error?e.message:"Request failed");}}
io.on("connection",socket=>{
  let sessionId:string|undefined;
  socket.on("session:create",(raw,ack)=>{try{const profile=profileSchema.parse(raw);sessionId=randomUUID();profiles.set(sessionId,profile);sockets.set(sessionId,socket.id);ack?.({ok:true,session:{id:sessionId,profile,createdAt:new Date().toISOString(),lastSeen:new Date().toISOString()}})}catch(e){ack?.({ok:false,error:"Invalid temporary identity"})}});
  socket.on("location:update",(raw,ack)=>{try{if(!sessionId)throw new Error("Session required");const p=z.object({lat:z.number(),lng:z.number()}).parse(raw);locations.update(sessionId,profiles.get(sessionId)!,p);emitNearby();ack?.({ok:true})}catch(e){ack?.({ok:false,error:e instanceof Error?e.message:"Invalid location"})}});
  socket.on("nearby:get",(ack)=>{if(!sessionId)return ack?.({ok:false});ack?.({ok:true,users:locations.nearby(sessionId)})});
  socket.on("chat:request",(raw,ack)=>{try{if(!sessionId)throw new Error("Session required");rate(sessionId,"request");const v=z.object({toId:z.string().uuid(),message:z.string().trim().max(LIMITS.initialMessage)}).parse(raw);if(!sockets.has(v.toId))throw new Error("This person is no longer available");const result=chats.request(sessionId,v.toId,v.message);if(result.mutual){const chat=result.chat!;for(const id of chat.participants)io.to(sockets.get(id)!).emit("spark:trigger",{chat,profiles:chat.participants.map(id=>({id,profile:profiles.get(id)}))});}else io.to(sockets.get(v.toId)!).emit("chat:request",{...result.request,from:{id:sessionId,profile:profiles.get(sessionId)}});ack?.({ok:true})}catch(e){ack?.({ok:false,error:e instanceof Error?e.message:"Request failed"})}});
  socket.on("chat:accept",(requestId,ack)=>{try{if(!sessionId)throw new Error("Session required");const chat=chats.accept(sessionId,String(requestId));for(const id of chat.participants)io.to(sockets.get(id)!).emit("chat:accepted",{chat,profiles:chat.participants.map(id=>({id,profile:profiles.get(id)}))});ack?.({ok:true})}catch(e){ack?.({ok:false,error:e instanceof Error?e.message:"Unavailable"})}});
  socket.on("chat:ignore",(id,ack)=>{try{if(!sessionId)throw new Error("Session required");chats.ignore(sessionId,String(id));ack?.({ok:true})}catch(e){ack?.({ok:false})}});
  socket.on("chat:message",(raw,ack)=>{try{if(!sessionId)throw new Error("Session required");rate(sessionId,"message");const v=z.object({chatId:z.string().uuid(),text:z.string().max(LIMITS.chatMessage)}).parse(raw);const m=chats.send(v.chatId,sessionId,v.text);const chat=chats.chats.get(v.chatId)!;chat.participants.forEach(id=>io.to(sockets.get(id)!).emit("chat:message",m));ack?.({ok:true})}catch(e){ack?.({ok:false,error:e instanceof Error?e.message:"Message failed"})}});
  socket.on("chat:typing",raw=>{if(!sessionId)return;const chat=chats.chats.get(String(raw));if(chat?.participants.includes(sessionId))chat.participants.filter(id=>id!==sessionId).forEach(id=>io.to(sockets.get(id)!).emit("chat:typing",{chatId:raw,userId:sessionId}));});
  socket.on("chat:leave",(id,ack)=>{try{if(!sessionId)throw new Error("Session required");const other=chats.leave(String(id),sessionId);io.to(sockets.get(other)!).emit("chat:left",{chatId:id,name:profiles.get(sessionId)?.displayName??"Someone"});ack?.({ok:true})}catch(e){ack?.({ok:false})}});
  socket.on("user:block",(id,ack)=>{if(!sessionId)return;chats.block(sessionId,String(id));emitNearby();ack?.({ok:true})});
  socket.on("user:report",raw=>{if(!sessionId)return;const v=z.object({reportedSessionId:z.string().uuid(),reason:z.enum(["Harassment","Spam","Inappropriate content","Inappropriate profile photo","Other"])}).safeParse(raw);if(v.success) console.info("report",{reporterSessionId:sessionId,...v.data,createdAt:new Date().toISOString()});});
  socket.on("disconnect",()=>{if(!sessionId)return; sockets.delete(sessionId);locations.remove(sessionId);chats.endSession(sessionId);profiles.delete(sessionId);emitNearby();});
});
http.listen(PORT,()=>console.log(`Spark server listening on ${PORT}`));
