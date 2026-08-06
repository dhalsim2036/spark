import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import { io, Socket } from "socket.io-client";
import {
  LIMITS,
  type Chat,
  type ChatRequest,
  type Message,
  type NearbyUser,
  type TemporaryProfile,
  type UserSession,
} from "@spark/shared";
import "leaflet/dist/leaflet.css";
import "./style.css";
const SERVER =
  import.meta.env.VITE_SERVER_URL ??
  (import.meta.env.DEV ? "http://localhost:3001" : window.location.origin);
type Request = ChatRequest & {
  from: { id: string; profile: TemporaryProfile };
};
type Active = { chat: Chat; other: { id: string; profile: TemporaryProfile } };
const pin = (profile: Pick<TemporaryProfile, "avatar" | "photoUrl">) =>
  L.divIcon({
    className: "spark-marker",
    html: `<div class="pin">${profile.photoUrl ? `<img src="${profile.photoUrl}" alt="" />` : profile.avatar}</div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
function Centre({ p }: { p: [number, number] }) {
  const m = useMap();
  useEffect(() => {
    m.setView(p, 16);
  }, [m, p]);
  return null;
}
function App() {
  const [step, setStep] = useState<"landing" | "identity" | "map">("landing"),
    [profile, setProfile] = useState<TemporaryProfile>({
      displayName: "",
      avatar: "🌙",
    }),
    [session, setSession] = useState<UserSession | null>(null),
    [pos, setPos] = useState<[number, number]>([37.7749, -122.4194]),
    [users, setUsers] = useState<NearbyUser[]>([]),
    [selected, setSelected] = useState<NearbyUser | null>(null),
    [incoming, setIncoming] = useState<Request | null>(null),
    [active, setActive] = useState<Active | null>(null),
    [messages, setMessages] = useState<Message[]>([]),
    [spark, setSpark] = useState(false),
    [notice, setNotice] = useState(""),
    [typing, setTyping] = useState(false);
  const socket = useRef<Socket>();
  useEffect(() => {
    const s = io(SERVER);
    socket.current = s;
    s.on("nearby:update", setUsers);
    s.on("chat:request", setIncoming);
    s.on("chat:accepted", ({ chat, profiles }) => openChat(chat, profiles));
    s.on("spark:trigger", ({ chat, profiles }) => {
      setSpark(true);
      setTimeout(() => {
        setSpark(false);
        openChat(chat, profiles);
      }, 1800);
    });
    s.on("chat:message", (m: Message) => setMessages((x) => [...x, m]));
    s.on("chat:typing", () => {
      setTyping(true);
      setTimeout(() => setTyping(false), 1200);
    });
    s.on("chat:left", ({ name }) => {
      setNotice(`${name} has left.`);
      setActive(null);
      setMessages([]);
    });
    return () => {
      s.disconnect();
    };
  }, []);
  const sessionRef = useRef<UserSession | null>(null);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  function openChat(
    chat: Chat,
    profiles: { id: string; profile: TemporaryProfile }[],
  ) {
    const me = sessionRef.current?.id;
    const other = profiles.find((p) => p.id !== me)!;
    setIncoming(null);
    setSelected(null);
    setActive({ chat, other });
    setMessages([]);
  }
  function start() {
    if (!profile.displayName.trim())
      return setNotice("Choose a temporary name to continue.");
    socket.current?.emit(
      "session:create",
      profile,
      (r: { ok: boolean; session: UserSession }) => {
        if (r.ok) {
          setSession(r.session);
          setStep("map");
          navigator.geolocation?.getCurrentPosition(
            (p) => updateLocation([p.coords.latitude, p.coords.longitude]),
            () => {
              setNotice("Location is needed to see people around you.");
              updateLocation(pos);
            },
            { enableHighAccuracy: false },
          );
        }
      },
    );
  }
  function updateLocation(p: [number, number]) {
    setPos(p);
    socket.current?.emit("location:update", { lat: p[0], lng: p[1] });
  }
  function sendRequest(message: string) {
    if (!selected) return;
    socket.current?.emit(
      "chat:request",
      { toId: selected.id, message },
      (r: { ok: boolean; error?: string }) => {
        if (r.ok) {
          setNotice("Message sent. They can choose when to respond.");
          setSelected(null);
        } else setNotice(r.error ?? "Couldn’t send message");
      },
    );
  }
  if (step !== "map")
    return (
      <Onboard
        step={step}
        setStep={setStep}
        profile={profile}
        setProfile={setProfile}
        start={start}
        notice={notice}
      />
    );
  function leaveChat() {
    if (!active) return;
    const leaving = active;
    socket.current?.emit(
      "chat:leave",
      leaving.chat.id,
      (result: { ok: boolean }) => {
        if (result.ok) {
          setActive(null);
          setMessages([]);
          setNotice("You left the conversation.");
        } else setNotice("The conversation has already ended.");
      },
    );
  }
  return (
    <main className="app">
      <header>
        <div className="brand">✦ Spark</div>
        <div className="count">
          {users.length
            ? `${users.length} ${users.length === 1 ? "person is" : "people are"} around you`
            : "No one is around right now"}
        </div>
      </header>
      <MapContainer center={pos} zoom={16} zoomControl={false} className="map">
        <Centre p={pos} />
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="© OpenStreetMap"
        />
        <Marker position={pos} icon={pin(profile)} />
        {users.map((u) => (
          <Marker
            key={u.id}
            position={[u.position.lat, u.position.lng]}
            icon={pin(u.profile)}
            eventHandlers={{ click: () => setSelected(u) }}
          />
        ))}
      </MapContainer>
      <p className="privacy">Approximate locations · refreshed gently</p>
      {selected && (
        <ProfileCard
          user={selected}
          close={() => setSelected(null)}
          send={sendRequest}
        />
      )}{" "}
      {incoming && (
        <Incoming
          request={incoming}
          accept={() => socket.current?.emit("chat:accept", incoming.id)}
          ignore={() => {
            socket.current?.emit("chat:ignore", incoming.id);
            setIncoming(null);
          }}
        />
      )}
      {active && (
        <ChatView
          active={active}
          mine={session!.id}
          messages={messages}
          typing={typing}
          send={(t: string) =>
            socket.current?.emit("chat:message", {
              chatId: active.chat.id,
              text: t,
            })
          }
          type={() => socket.current?.emit("chat:typing", active.chat.id)}
          leave={leaveChat}
        />
      )}{" "}
      {spark && (
        <div className="spark">
          <span>✨</span>
          <h1>SPARK</h1>
          <p>You found each other.</p>
        </div>
      )}
      {notice && (
        <button className="toast" onClick={() => setNotice("")}>
          {notice}
        </button>
      )}
    </main>
  );
}
function Onboard({ step, setStep, profile, setProfile, start, notice }: any) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const [photoError, setPhotoError] = useState("");

  async function choosePhoto(file?: File) {
    if (!file) return;
    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
        throw new Error("Choose a JPG, PNG, or WebP image.");
      if (file.size > LIMITS.photoBytes)
        throw new Error("Choose a photo smaller than 2 MB.");

      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      const size = 256;
      const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
      const sourceX = (image.naturalWidth - sourceSize) / 2;
      const sourceY = (image.naturalHeight - sourceSize) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      canvas
        .getContext("2d")
        ?.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
      URL.revokeObjectURL(objectUrl);
      const photoUrl = canvas.toDataURL("image/jpeg", 0.78);
      if (photoUrl.length > 500_000)
        throw new Error("That photo could not be prepared. Try another image.");
      setProfile({ ...profile, photoUrl });
      setPhotoError("");
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Could not use that photo.");
    }
  }

  return (
    <main className="onboard">
      <div className="orb">✦</div>
      {step === "landing" && (
        <>
          <p className="eyebrow">A temporary moment</p>
          <h1>Spark</h1>
          <p className="tag">
            Maybe the person you’re looking for is already nearby.
          </p>
          <button onClick={() => setStep("identity")}>Start</button>
        </>
      )}
      {step === "identity" && (
        <>
          <label>
            Name
            <input
              maxLength={30}
              value={profile.displayName}
              placeholder="Alex, Moon, Coffee Lover"
              onChange={(e) =>
                setProfile({ ...profile, displayName: e.target.value })
              }
            />
          </label>
          <input
            ref={cameraInput}
            className="photo-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="user"
            aria-label="Take or upload a temporary profile photo"
            onChange={(event) => {
              void choosePhoto(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
          <input
            ref={libraryInput}
            className="photo-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Choose a temporary profile photo from your photo library"
            onChange={(event) => {
              void choosePhoto(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
          <div className="photo-actions">
            <button
              type="button"
              className="photo-choice"
              onClick={() => cameraInput.current?.click()}
            >
              {profile.photoUrl ? (
                <img src={profile.photoUrl} alt="Selected temporary avatar" />
              ) : (
                <span aria-hidden="true">✦</span>
              )}
              <span>Take photo</span>
            </button>
            <button
              type="button"
              className="photo-choice quiet"
              onClick={() => libraryInput.current?.click()}
            >
              <span aria-hidden="true">▣</span>
              <span>Photo library</span>
            </button>
          </div>
          <p className="photo-note">
            Your photo is cropped, stripped of metadata, and removed when this session ends.
          </p>
          {photoError && <p className="error">{photoError}</p>}
          <label>
            Gender <small>(optional)</small>
            <select
              value={profile.gender ?? ""}
              onChange={(e) =>
                setProfile({ ...profile, gender: e.target.value || undefined })
              }
            >
              <option value="">Prefer not to say</option>
              <option value="woman">Woman</option>
              <option value="man">Man</option>
              <option value="nonbinary">Non-binary</option>
              <option value="self_describe">Self-describe</option>
            </select>
          </label>
          <p className="fine">
            Your identity and location are temporary. Your exact location is
            never shown.
          </p>
          <p className="age-note">
            By continuing, you confirm you’re at least 13 years old.
          </p>
          <button onClick={start}>Continue</button>
        </>
      )}
      {notice && <p className="error">{notice}</p>}
    </main>
  );
}
function ProfileCard({
  user,
  close,
  send,
}: {
  user: NearbyUser;
  close: () => void;
  send: (x: string) => void;
}) {
  const [text, setText] = useState("Hey 👋");
  return (
    <section className="sheet">
      <button className="x" onClick={close}>
        ×
      </button>
      <ProfileVisual profile={user.profile} />
      <h2>{user.profile.displayName}</h2>
      <p>Maybe you crossed paths.</p>
      <textarea
        maxLength={300}
        value={text}
        aria-label="Initial message"
        onChange={(e) => setText(e.target.value)}
      />
      <button onClick={() => send(text)}>Say hey</button>
    </section>
  );
}
function Incoming({
  request,
  accept,
  ignore,
}: {
  request: Request;
  accept: () => void;
  ignore: () => void;
}) {
  return (
    <section className="modal">
      <ProfileVisual profile={request.from.profile} />
      <h2>{request.from.profile.displayName}</h2>
      <blockquote>“{request.message}”</blockquote>
      <div className="row">
        <button onClick={accept}>Accept</button>
        <button className="quiet" onClick={ignore}>
          Ignore
        </button>
      </div>
    </section>
  );
}
function ProfileVisual({
  profile,
}: {
  profile: Pick<TemporaryProfile, "avatar" | "photoUrl">;
}) {
  return (
    <div className="avatar">
      {profile.photoUrl ? <img src={profile.photoUrl} alt="" /> : profile.avatar}
    </div>
  );
}
function ChatView({ active, mine, messages, typing, send, type, leave }: any) {
  const [text, setText] = useState("");
  return (
    <section className="chat">
      <header>
        <button className="quiet" onClick={leave}>
          Leave
        </button>
        <div>
          <b>{active.other.profile.displayName}</b>
          <small>temporary conversation</small>
        </div>
        <span aria-hidden="true" className="chat-spacer" />
      </header>
      <div className="thread">
        {messages.map((m: Message) => (
          <p key={m.id} className={m.senderId === mine ? "mine" : "theirs"}>
            {m.text}
          </p>
        ))}
        {typing && <i>typing…</i>}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) {
            send(text);
            setText("");
          }
        }}
      >
        <input
          maxLength={1000}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            type();
          }}
          placeholder="Write a message…"
        />
        <button>Send</button>
      </form>
    </section>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
