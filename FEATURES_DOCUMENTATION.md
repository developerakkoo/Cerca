# Cerca — Complete Ride-Hailing Platform
## Features & Architecture Documentation

---

## 📋 Table of Contents

1. [Executive Summary](#-executive-summary)
2. [Platform at a Glance](#-platform-at-a-glance)
3. [System Architecture](#-system-architecture)
4. [Rider App — Features](#-rider-app--features)
5. [Driver App — Features](#-driver-app--features)
6. [Admin Operations Console — Features](#-admin-operations-console--features)
7. [Real-Time Engine](#-real-time-engine)
8. [Intelligent Ride Matching & Dispatch](#-intelligent-ride-matching--dispatch)
9. [Payments & Money Movement](#-payments--money-movement)
10. [Safety & Trust](#-safety--trust)
11. [Maps & Location Intelligence](#-maps--location-intelligence)
12. [Advanced Architecture Highlights](#-advanced-architecture-highlights)
13. [Technology Stack](#-technology-stack)
14. [Localization & Accessibility](#-localization--accessibility)
15. [Security](#-security)

---

## 🎯 Executive Summary

**Cerca** is a complete, production-grade ride-hailing platform — a full multi-sided marketplace connecting **riders**, **drivers**, and **fleet vendors**, managed through a powerful **admin operations console**.

The platform consists of **four coordinated systems**:

| System | Technology | Purpose |
|--------|-----------|---------|
| **Rider App** | Ionic Angular 19 + Capacitor 7 (iOS & Android) | Booking, live tracking, payments, chat, safety |
| **Driver App** | Flutter 3 (native performance) | Onboarding/KYC, ride offers, navigation, earnings & payouts |
| **Admin Console** | Angular 20 + Ionic 8 SPA (Firebase-hosted) | Full operations control plane: users, drivers, vendors, rides, money, safety, support |
| **Backend Platform** | Node.js API + Socket.IO server + MongoDB (geospatial) | Dispatch/matching engine, real-time event hub, payments (Razorpay), FCM push |

Every application communicates with the backend over **REST APIs and a shared real-time Socket.IO event bus**, giving the entire platform sub-second, event-driven synchronization — a ride status change is instantly reflected on the rider's phone, the driver's phone, and the admin's live operations dashboard simultaneously.

### Key Platform Capabilities

- **End-to-end ride lifecycle** — request → match → OTP-verified pickup → live tracking → OTP-verified drop → payment → rating
- **Multiple product lines** — Instant rides (3 vehicle tiers: Zip, Glide, Titan), Full-Day hires, Rentals, and Date-Wise scheduled bookings
- **Advanced dispatch** — stacked ride matching (next trip offered near drop-off), driver "GO TO home" corridor matching, demand heatmaps
- **Complete money stack** — cash, wallet, Razorpay online payments, hybrid wallet+gateway payments, promo/gift coupons, driver payouts, vendor payouts, dispute resolution desk
- **Fleet vendor ecosystem** — vendors onboard drivers and vehicles with a two-stage (vendor → admin) approval workflow
- **Safety-first design** — in-ride SOS with live location streaming, emergency contacts, admin emergency response center
- **Resilience by design** — automatic ride restoration after app kill, exponential-backoff reconnection, backend state reconciliation on every reconnect
- **Multi-language** — English, Hindi, Marathi across rider and driver apps

---

## 🌐 Platform at a Glance

```
                        ┌─────────────────────────────────┐
                        │        CERCA BACKEND            │
                        │   api.cercacars.online          │
                        │                                 │
                        │  • REST API (Node.js)           │
                        │  • Socket.IO real-time hub      │
                        │  • Dispatch & matching engine   │
                        │  • MongoDB (geospatial data)    │
                        │  • Razorpay payment gateway     │
                        │  • FCM push notifications       │
                        │  • Google Maps services proxy   │
                        └───────┬─────────┬─────────┬─────┘
                                │         │         │
                 REST + Socket.IO   REST + Socket.IO   REST + Socket.IO
                                │         │         │
                    ┌───────────┴──┐  ┌───┴──────┐  ┌┴─────────────────┐
                    │  RIDER APP   │  │  DRIVER  │  │  ADMIN CONSOLE   │
                    │              │  │   APP    │  │                  │
                    │ Ionic Angular│  │ Flutter  │  │ Angular 20 SPA   │
                    │ iOS + Android│  │  Native  │  │ Firebase Hosting │
                    └──────────────┘  └──────────┘  └──────────────────┘
```

### The Complete Ride Flow Across All Systems

```
RIDER                    BACKEND                   DRIVER                  ADMIN
─────                    ───────                   ──────                  ─────
Book ride ──────────────► Matching engine
                          finds drivers ──────────► Ride offer appears
                                                    (15s countdown,
                                                     even when app is
                                                     backgrounded via
                                                     system overlay)
                          ◄──────────────────────── Driver accepts
Driver assigned ◄──────── rideAccepted event ─────────────────────────────► Live ride visible
Live driver                                                                  on ops dashboard
tracking on map ◄──────── GPS stream (every ~1s) ◄─ Driver location
                                                    streaming
Start OTP shown           OTP verified ◄─────────── Driver enters OTP
Trip in progress ◄─────── rideStarted ────────────────────────────────────► Status auto-updates
Live route +
share-trip link
End OTP → trip done ◄──── rideCompleted ──────────► Cash collection /
Pay (cash/wallet/                                   settlement screen
online) + rate driver                               + rate rider ──────────► Earnings ledger,
                                                                             platform fee
                                                                             receivables
```

---

## 🏗️ System Architecture

### Event-Driven, Real-Time Core

The heart of Cerca is a **shared Socket.IO event bus**. All three client applications maintain persistent WebSocket connections to the backend. Every meaningful state change — a ride request, a driver's GPS position, an OTP verification, a payment, an emergency alert — is propagated as a typed event to every party that needs it, in real time.

**Why this matters:** there is no polling, no refresh buttons, no stale state. A driver moving on the road is reflected on the rider's map and the admin's ride-detail map within a second.

### Layered Client Architecture (all three apps)

Each client follows the same disciplined layering:

```
┌────────────────────────────────────────────────┐
│  UI Layer (Pages / Screens / Components)       │
│  Subscribes to reactive state; never talks     │
│  to the network directly                       │
├────────────────────────────────────────────────┤
│  State Layer                                   │
│  Rider/Admin: RxJS BehaviorSubjects/Observables│
│  Driver: Provider ChangeNotifiers              │
│  Single source of truth per domain             │
├────────────────────────────────────────────────┤
│  Service Layer                                 │
│  Ride, Payment, Wallet, Socket, Maps, Auth …   │
│  Encapsulates REST + Socket.IO per domain      │
├────────────────────────────────────────────────┤
│  Transport Layer                               │
│  HTTP interceptors (auth, block detection)     │
│  Socket.IO with custom reconnection engine     │
├────────────────────────────────────────────────┤
│  Persistence Layer                             │
│  Ionic Storage / SharedPreferences             │
│  Session, active ride, pending settlements     │
└────────────────────────────────────────────────┘
```

### State Reconciliation — Never Lose a Ride

A distinguishing architectural feature: **the client is never the source of truth; the backend is.**

1. Active ride state is persisted locally on every change.
2. On app launch (even after a force-kill or crash), the app restores the local snapshot **and immediately reconciles with the backend** (`/rides/user/:id`).
3. The user is routed to exactly the right screen: still searching → searching page; driver en route → live tracking; ride finished but unpaid → payment screen; driver-cancelled mid-trip → settlement screen.
4. On every socket reconnection, ride state is re-synced from the backend automatically.

This means a rider can lose signal in a tunnel, have their phone die, restart it — and land exactly where their trip actually is.

### Custom Reconnection Engine

The built-in Socket.IO reconnection is deliberately disabled in favor of a custom engine:

- **Exponential backoff with jitter** — delay = `2000ms × 2^(attempt−1) + random jitter`, capped at 30 seconds, up to 10 attempts (rider) / 5 attempts (driver)
- **Network-aware** — Capacitor Network plugin detects connectivity restoration and immediately triggers reconnection rather than waiting out the backoff timer
- **Lifecycle-aware** — app resume from background triggers reconnection and push-token re-sync
- **Post-reconnect protocol** — every successful reconnect re-registers the client (`riderConnect` / `driverConnect`) and performs full ride-state reconciliation

---

## 📱 Rider App — Features

**Stack:** Ionic Angular 19.2 · Ionic 8.5 · Capacitor 7.2 · native iOS & Android

### 1. Authentication & Onboarding
- **Phone-number login** — instant login/registration by mobile number; new users complete a short profile (name, email)
- **Session persistence** — secure token storage with automatic session restoration on relaunch
- **Push registration** — FCM token registered and kept in sync with the backend on login, resume, and reconnection
- **Account state gates** — blocked-account screen, maintenance-mode screen, and force-update screen enforced before the app boots into normal use

### 2. Home & Booking Experience
- **Native Google Map home screen** (Capacitor Google Maps SDK with custom Map ID styling) centered on live GPS position
- **Pickup selection** — GPS auto-detect, drag-to-pin confirmation with live reverse geocoding, or saved-address selection
- **Destination search** — Google Places autocomplete **proxied through the backend** (the Places API key is never exposed in the client)
- **Uber-style vehicle picker** — bottom-sheet trip chooser with per-tier fares and ETAs:
  - **Cerca Zip** — compact & economical
  - **Cerca Glide** — comfortable mid-tier
  - **Cerca Titan** — premium large vehicle
- **Live fare engine** — fares computed server-side from admin-configured pricing (distance slabs, per-tier base fares, time-of-day multipliers), with client-side response caching
- **Book for someone else** — enter another passenger's name and phone at checkout

### 3. Specialty Booking Products
Beyond instant rides, the platform supports scheduled products end-to-end (rider request → driver's upcoming-bookings queue → admin visibility):
- **Full-Day hire** — book a driver and vehicle for an entire day
- **Rental** — hourly/duration-based rental bookings
- **Date-Wise** — multi-date scheduled bookings with time-slot selection (e.g., daily office commute)

### 4. Ride Matching & Waiting Experience
- Animated **cab-searching screen** with slide-to-cancel
- Graceful **no-driver-found** handling with retry
- Instant transition to driver-assigned view the moment a driver accepts

### 5. Live Trip Experience
- **Real-time driver tracking** — driver's marker moves live on the map from the moment of acceptance through drop-off
- **Live ETA and route** updates throughout the trip
- **Dual-OTP trip security** — a start OTP (shared with the driver at pickup) and a stop OTP (at drop-off) cryptographically bracket every trip; no trip can be started or ended without rider-held codes
- **Mid-trip destination change** — riders can change the drop-off during the ride; the fare is re-quoted live and applied with optimistic-concurrency protection (`destinationRevision`) so no update is ever lost or double-applied
- **Pickup wait-charge preview** — transparent display of waiting charges before they apply
- **Call driver** and **in-app chat** (see below)
- **Share My Trip** — generate a public tracking link; anyone with the link watches the trip's live location and status in a browser, no app required. Links are revocable.

### 6. In-App Chat
- Real-time rider ↔ driver messaging over the socket bus, scoped per-ride
- Message history, delivery confirmation, unread-count badges
- Quick-reply support on the driver side

### 7. Payments (Rider Side)
- **Cash** — pay the driver on completion
- **Wallet** — in-app wallet with Razorpay top-up, transaction history with infinite scroll, and prepaid ride payment
- **Razorpay online** — post-ride "Pay Online" with server-side payment verification; can switch to cash at any point before paying
- **Hybrid payments** — wallet balance + Razorpay gateway combined in one payment when the wallet alone can't cover the fare
- **Promo coupons** — validated server-side and applied at request time
- **Gift coupons** — reward coupons (including automated birthday/milestone gifts pushed from the admin console) presented with a celebratory confetti experience

### 8. Financial Integrity Safeguards
- **Pending-dues gate** — a rider with unresolved payment disputes or unpaid cancellation settlements is blocked from booking until dues are cleared
- **Driver-cancel settlement flow** — if a driver cancels mid-trip, a dedicated settlement screen bills the ridden portion fairly (wallet / online / cash / acknowledgment), and survives app restarts until resolved
- **Payment dispute reporting** — riders can raise disputes that flow directly into the admin dispute-resolution desk

### 9. Safety (Rider Side)
- **One-tap SOS** during any ride — reason selection (accident, harassment, unsafe driving, medical, other) plus free-text description
- After an SOS, the app **streams the rider's live location every 5 seconds for up to 30 minutes** to the emergency response center
- Emergency appears instantly on the admin console with live location tracking

### 10. Ride History & Bookings
- Active + past rides with full details, live countdown timers on searching rides, in-list cancellation, and one-tap driver dialing
- Date-organized history with driver, fare, and rating details

### 11. Profile, Addresses & Preferences
- Profile editing with photo
- **Saved addresses** — Home / Office / custom labels, with pinned favorites, fully integrated into booking
- **Language switcher** — English / Hindi / Marathi, applied instantly and persisted
- Notification center (socket-driven, mark-read / clear-all)
- FAQ, legal (terms/privacy), and support access

### 12. Customer Support
- **Real-time support chat** — riders open typed support tickets (Ride / Payment / Account / General) and chat live with admin agents, complete with typing indicators, queue status, and post-resolution feedback rating

---

## 🚗 Driver App — Features

**Stack:** Flutter 3 (Dart) · Provider state management · native Android/iOS performance

### 1. Onboarding & KYC Pipeline
A complete, state-machine-driven onboarding funnel:
- **Registration** with GPS capture and profile photo
- **Compliance documents** — Aadhaar, Driving License (with expiry), PAN — uploaded as typed documents
- **Vehicle garage** — register owned vehicles with RC, insurance, permit, and PUC documents; set the active vehicle; archive/restore vehicles
- **Fleet-vendor path** — drivers can join a vendor's fleet and be assigned fleet vehicles (with the ability to leave the vendor later)
- **Status routing** — the app automatically routes drivers to the correct gate: pending verification → rejection & resubmission (with the exact admin rejection reason shown) → blocked → approved & live
- **Priority Driver program** — upload a qualifying document (e.g., IT company ID) for priority ride matching, with its own approval workflow

### 2. Going Online & Availability
- **Online/offline toggle** with a full permission bootstrap (location, background location, notifications, system-overlay, battery-optimization exemption)
- **Ride preferences** — toggle which tiers to receive (Zip / Glide) in real time via socket; Titan availability always on
- **Demand heatmap** — a live map of high/medium/low demand zones computed from completed-ride density, so drivers can position themselves where riders are

### 3. Ride Offers — Never Miss a Request
- Offers arrive as real-time socket events with a **15-second accept/reject countdown**, sound, and haptic vibration
- **System-overlay offers** — when the app is backgrounded, ride offers appear as an Android system overlay **on top of whatever the driver is doing** (navigation, another app, home screen), with the same countdown and accept/reject actions
- **FIFO offer queue** — simultaneous offers are queued and presented in order; timeouts auto-reject and advance the queue
- **Stacked ride acceptance** — while finishing a trip, drivers near their drop-off receive *destination-reach* offers for the next ride; accepting queues it (`rideQueued`) and it auto-promotes to the active trip on completion — near-zero idle time between trips

### 4. Active Trip Management
- Live trip map with phase-aware pickup/drop guidance
- **Slide-to-act controls** — arrived, start trip (rider's start OTP), end trip (rider's stop OTP)
- **One-tap external navigation** — hands off to Google Maps turn-by-turn (`google.navigation:` intent) automatically on accept and on trip start
- Live destination-change handling when the rider updates the drop-off
- Rider chat with quick replies, call rider, and in-ride emergency alert
- Cancellation with reasons, including withdraw-before-arrival

### 5. Location Streaming (Adaptive)
- Single GPS fix emitted on going online
- **During an active ride:** high-frequency adaptive streaming — a distance-filtered GPS stream that emits on ≥20m movement or ≥800ms elapsed, with heading, feeding the rider's and admin's live maps
- Accuracy-gated (≤50m) periodic fallback when the trip screen isn't in the foreground

### 6. Earnings, Payouts & Money
- **Earnings dashboard** — totals, statistics, and date-filtered ledgers, updated live via `driverEarningAdded` socket events the moment a trip settles
- **Cash collection & settlement screen** after every trip — cash change calculator, online/wallet awareness, payment-method flips, and dispute reporting
- **Bank account management** and **payout requests** against available balance
- **Payment history** with pagination
- **Mileage reports** — per-day/per-ride distance analytics
- **Platform-fee awareness** — cash-ride platform fees tracked as receivables (collected via the admin console)

### 7. Scheduled Work
- **Upcoming bookings** screen for Full-Day, Rental, and Date-Wise assignments

### 8. Ratings & Reputation
- Rate riders after every trip; view own rating history and statistics

### 9. Safety (Driver Side)
- In-ride emergency alert with live emergency location ticks to the ops center
- **Trusted emergency contacts** managed from device contacts

### 10. Profile & Settings
- Profile editing with photo, GO-TO home destination (see [Dispatch](#-intelligent-ride-matching--dispatch)), ride settings, notifications, language (English / Hindi / Marathi), help & support

---

## 🖥️ Admin Operations Console — Features

**Stack:** Angular 20.3 · Ionic 8.7 · Socket.IO · Google Maps JS API · deployed on Firebase Hosting

A single-pane-of-glass **control plane** for the entire marketplace. JWT-authenticated, route-guarded, with live socket feeds throughout.

### 1. Live Operations Dashboard
- KPI cards: total riders, drivers online/offline, ride volumes, pending driver/vendor/vehicle approvals, active emergencies
- **Real-time registration alerts** — new driver signups, vendor applications, vehicle submissions, and payout requests surface as live toast notifications with unread badges
- Live support-queue statistics

### 2. Rider Management
- Paginated, searchable, filterable user directory (active / blocked / verified)
- Edit profiles and photos, verify, block/unblock, delete
- **Direct wallet adjustment** — credit or debit any rider's wallet with an audit trail

### 3. Driver Management
- Full driver directory with smart filters (new, priority-pending, vehicle-pending, pending-admin)
- **Two-stage approval workflow** — vendor pre-approval → admin final approval, with per-document review
- **Compliance document review** — Aadhaar / DL / PAN approve/reject with reasons and resubmission flags
- **Priority Driver approvals** with document inspection
- Per-driver earnings, payouts, distance KPIs, and a **GO-TO route visualization** (home location, route origin, corridor polyline) rendered on a map

### 4. Vendor (Fleet Operator) Management
- Vendor onboarding review — document verification, approve/reject with resubmission, block/unblock
- Fleet vehicle approvals and vendor payout processing with wallet-deduction handling

### 5. Vehicle Inventory
- **Unified inventory** across vendor fleet vehicles and independent driver vehicles
- Status / ownership / vendor filters; document-level approve/reject with resubmission workflow

### 6. Live Ride Operations
- Ride directory with status, payment-status, and date filters — **auto-refreshing on live ride-status events**
- **Ride detail with live map** — the admin joins the ride's socket room and watches the driver marker, route polyline, pickup/drop/accept points, and destination changes in real time
- Full **ride timeline** (every lifecycle event, timestamped)
- **Admin interventions** — cancel a ride, or **manually assign a driver** (searched by phone/email) to a stuck request
- GPS-measured vs. estimated distance comparison surfaced per ride for fare integrity

### 7. Financial Operations
- **Driver earnings ledger** — platform-wide and per-driver drill-downs, bulk status updates
- **Cash platform-fee receivables** — track and collect the platform's share of cash trips owed by drivers
- **Payout processing** — driver and vendor payout queues with transaction IDs and failure-reason capture
- **Platform earnings analytics** — day/week/month revenue views

### 8. Payment Dispute Desk
- Dispute inbox with statistics and severity handling
- Evidence review and complete **audit log** per dispute
- Resolution actions: confirm fraud, reject complaint, verify gateway capture, company-settle, waive
- **One-click Razorpay reconciliation** against gateway records

### 9. Pricing & Platform Configuration
- Per-tier pricing for **Zip / Glide / Titan** — base fares, distance slabs, cancellation fees
- **Time-of-day fare multipliers** (timezone-aware surge windows)
- **Stacked-matching configuration** — enable/disable destination-reach offers and tune the matching radius (meters)
- **Maintenance mode** and **force-update** switches that gate the rider app remotely
- Prepaid payment-method feature flags (wallet / Razorpay prepaid enablement)

### 10. Promo & Gift Engine
- Full coupon CRUD — fixed or percentage discounts, usage limits, service/ride-type scoping
- **Automated gift coupons** — auto-assigned on rules like minimum-rides milestones or user birthdays
- Manual gift assignment to individual riders

### 11. Emergency Response Center
- All SOS alerts (rider and driver) with active/resolved/dismissed workflow
- **Live location tracking** of an active emergency on a map, updating in real time as the affected user's device streams position
- One-tap open-in-maps for dispatching help

### 12. Support Center
- Waiting / active / resolved ticket queues with unread badges surfaced across the console
- **Real-time agent chat** — accept tickets over socket, chat with typing indicators, resolve with status propagation back to the rider app

### 13. Analytics
- Date-range platform statistics and earnings analytics
- **Demand heatmap** — geographic high/medium/low demand zones for supply planning (the same intelligence powering the driver app's heatmap)

### 14. Notifications & Push Tooling
- In-app admin notification feed with deep links to the relevant entity
- **FCM test harness** — send test pushes by user ID, driver ID, or raw token for QA

---

## ⚡ Real-Time Engine

The Socket.IO event bus carries **60+ typed events** across the platform. A representative view:

### Ride Lifecycle Events
| Event | Producer → Consumers |
|-------|---------------------|
| `newRideRequest` | Rider → matching engine → eligible drivers |
| `rideAccepted` / `rideAssigned` / `rideQueued` | Driver → backend → rider + admin |
| `driverLocationUpdate`, `rideLocationUpdate` | Driver GPS stream → rider map + admin map |
| `driverArrived`, `rideStarted`, `rideCompleted` | OTP-gated lifecycle transitions → all parties |
| `rideDestinationUpdated` | Rider mid-trip change → driver + admin (with revision control) |
| `rideCancelled`, `noDriverFound`, `rideNoLongerAvailable` | Terminal/competitive outcomes → all parties |
| `riderSettlementCompleted`, `paymentRequired`, `paymentCompleted` | Payment orchestration events |

### Messaging, Support & Safety Events
- Per-ride chat rooms (`joinRideRoom` / `sendMessage` / `receiveMessage` / `unreadCountUpdated`)
- Support namespace (`support:new_issue`, `support:accept`, `support:message`, `support:typing`, `support:status_changed`, `support:stats_updated`)
- Emergency channel (`emergencyAlert`, `emergencyLocationUpdate`) with forced-acknowledgment alerts on the admin console
- Live ops feed (`adminRegistrationAlert`, `rideStatusUpdated`, `driverEarningAdded`, `sharedRideStatusUpdate`)

### Room-Based Isolation
Chat, live tracking, shared-trip viewers, and admin ride monitoring all use **socket rooms scoped per ride**, so events are delivered only to the parties entitled to them.

---

## 🧠 Intelligent Ride Matching & Dispatch

The backend matching engine (configured live from the admin console) implements several advanced dispatch strategies:

1. **Proximity matching** — geospatial driver lookup against MongoDB location data, filtered by vehicle tier, driver ride preferences, and online status
2. **Stacked matching (destination-reach)** — when a driver approaches their drop-off (within an admin-configurable radius), the engine offers them the *next* nearby ride before the current one ends. The driver app queues it (`rideQueued`) and promotes it automatically on completion — dramatically reducing driver idle time and rider wait time
3. **GO-TO corridor matching** — drivers heading home set a GO-TO destination; the engine biases offers along that corridor so the last rides of a shift pay for the commute
4. **Priority Driver tier** — verified priority drivers (with document-backed approval) receive preferential matching
5. **Competitive offer resolution** — offers are broadcast with a 15-second client deadline; the first acceptance wins, others receive `rideNoLongerAvailable`; unfilled requests degrade gracefully to `noDriverFound`
6. **Manual dispatch override** — admins can hand-assign any driver to any request from the console
7. **Demand heatmaps** — completed-ride density is aggregated into geographic demand zones consumed by both the driver app (positioning) and the admin console (planning)

---

## 💳 Payments & Money Movement

### Rider-Side Payment Matrix
| Method | Timing | Notes |
|--------|--------|-------|
| **Cash** | On completion | Driver-side change calculator; platform fee tracked as receivable |
| **Wallet** | Prepaid or post-ride | Razorpay-backed top-ups; full transaction ledger |
| **Razorpay** | Post-ride (prepaid optionally enabled by admin flag) | Server-side order creation + signature verification |
| **Hybrid** | Prepaid | Wallet balance + gateway payment combined atomically |

### Platform Money Flows
- **Promo & gift coupons** — server-validated, applied at request time; automated gifting rules (birthdays, ride milestones)
- **Driver earnings** — credited per trip in real time; visible instantly in the driver app via socket events
- **Payouts** — driver and vendor payout request → admin processing → transaction-ID capture, with failure handling
- **Cash platform-fee receivables** — the platform's cut of cash trips is tracked per driver and collected through the admin console
- **Driver-cancel settlements** — mid-trip driver cancellations trigger a fair, persisted billing flow for the ridden portion, blocking future bookings until resolved
- **Dispute lifecycle** — rider/driver reports → admin evidence review → resolution (fraud confirm / reject / gateway verify / company settle / waive) → **Razorpay gateway reconciliation** — all audit-logged

---

## 🛡️ Safety & Trust

- **Dual-OTP trips** — rider-held start and stop OTPs bracket every trip; neither pickup nor drop can be falsified
- **In-ride SOS (both sides)** — reason-coded alerts with **live location streaming (5-second pings, up to 30 minutes)** to the emergency response center
- **Emergency response center** — live-tracked emergencies on the admin console with resolve/dismiss workflow and forced-acknowledgment alerting
- **Trusted contacts** — drivers register emergency contacts from their phone book
- **Share My Trip** — riders share a revocable public live-tracking link with family/friends; no app install needed to follow the trip
- **Two-stage identity verification** — vendor and admin document review (Aadhaar / DL / PAN / RC / insurance / permit / PUC) before any driver or vehicle goes live
- **Two-way ratings** — riders rate drivers, drivers rate riders; full rating histories on both sides and in the admin console
- **Account controls** — verify / block / unblock across riders, drivers, and vendors, with blocked-state screens enforced in the apps immediately

---

## 🗺️ Maps & Location Intelligence

| Capability | Implementation |
|------------|----------------|
| **Rider map** | Native Capacitor Google Maps SDK (hardware-accelerated) with custom Map ID styling |
| **Driver map** | google_maps_flutter with phase-aware pickup/drop guidance |
| **Admin maps** | Google Maps JS API — live ride tracking, GO-TO visualization, demand heatmaps, emergency location |
| **Places autocomplete** | **Backend-proxied** — the Places API key never ships in client binaries |
| **Geocoding** | Forward + reverse geocoding for pin-drop confirmation and address resolution |
| **Route rendering** | Directions-based polylines with **Douglas–Peucker simplification** and animated route drawing on the rider home |
| **Live tracking** | Adaptive GPS streaming (distance + time filtered, heading-aware) → socket → all subscribed maps |
| **Turn-by-turn** | Deep-link handoff to Google Maps navigation on the driver side, auto-triggered at accept and trip start |
| **Native map lifecycle management** | A dedicated lifecycle service suspends/destroys native map layers under overlays — eliminating the classic "map bleeding through modals" class of hybrid-app bugs |
| **Distance integrity** | GPS-measured route distance compared against the estimated A→B distance per ride, surfaced to admins for fare auditing |

---

## 🏆 Advanced Architecture Highlights

These are the engineering decisions that set Cerca apart from template-grade ride-hailing builds:

1. **Backend-authoritative state with full client reconciliation** — every app restart and every socket reconnect re-syncs trip state from the server. Trips survive crashes, force-kills, dead batteries, and network blackouts, and users always resume at the exact correct screen — including pending payment and pending settlement screens.

2. **Custom reconnection engine** — library auto-reconnect is disabled in favor of exponential backoff with jitter, network-event triggers, app-lifecycle triggers, and a post-reconnect re-registration + re-sync protocol.

3. **Stacked dispatch (destination-reach matching)** — back-to-back trip chaining with an admin-tunable radius, implemented end-to-end: matching engine → queued-offer semantics in the driver app → automatic promotion on trip completion.

4. **System-overlay ride offers** — drivers receive full accept/reject offer cards *over other apps* while backgrounded, with countdown, sound, and haptics — solving the single biggest driver-app failure mode (missed requests).

5. **Optimistic-concurrency destination changes** — mid-trip destination edits carry a `destinationRevision`, so concurrent updates between rider, driver, and server can never silently clobber each other.

6. **Terminal-trip orchestration** — the platform distinguishes and separately orchestrates: normal completion, rider cancellation before pickup, driver cancellation before pickup, and driver cancellation mid-trip (with fair partial billing) — each with its own persisted, restart-proof settlement flow.

7. **Three-sided real-time synchronization** — one event bus keeps rider, driver, and admin views coherent to the second, including live admin ride rooms and forced-acknowledgment emergency alerts.

8. **Remote platform control** — maintenance mode, force-update, pricing, surge multipliers, prepaid-payment flags, and matching radii are all live-configurable from the admin console with no app release required.

9. **API-key hygiene** — Google Places traffic is proxied through the backend so high-value API keys are never embedded in distributed client binaries.

10. **Financial integrity by construction** — booking gates on unpaid dues, audit-logged dispute resolution, gateway reconciliation against Razorpay, server-side payment verification, and per-driver cash-fee receivables.

11. **Marketplace depth** — a genuine three-actor supply side (independent drivers, vendors, fleet vehicles) with two-stage document approval workflows, not just a driver list.

12. **Domain-driven service architecture** — 20+ single-responsibility services per client (socket, ride, payment, wallet, coupon, fare, settings, maps, places, geocoding, permissions, FCM, support, sharing, disputes…), reactive state containers, and strict UI/state/transport layering — the codebase is built to be extended.

---

## 🛠️ Technology Stack

### Rider App
| Layer | Technology |
|-------|-----------|
| Framework | Angular 19.2 + Ionic 8.5 |
| Native runtime | Capacitor 7.2 (iOS + Android) |
| Maps | @capacitor/google-maps (native SDK) + Google Directions/Geocoding |
| Real-time | socket.io-client 4.8 + ngx-socket-io |
| State | RxJS 7.8 (BehaviorSubject-driven reactive state) |
| Persistence | Ionic Storage |
| Payments | Razorpay Web Checkout |
| Push | Capacitor Push Notifications (FCM) + Local Notifications |
| i18n | ngx-translate 16 (en / hi / mr) |
| Device | Geolocation, Network, App, Device, Haptics, Keyboard, Status Bar plugins |

### Driver App
| Layer | Technology |
|-------|-----------|
| Framework | Flutter 3 (Dart 3) |
| State | Provider (ChangeNotifier) |
| HTTP | Dio |
| Real-time | socket_io_client 3.1 |
| Maps | google_maps_flutter + Places/Geocoding REST |
| Location | Geolocator (adaptive distance/time-filtered streaming) |
| Background | flutter_background_service + flutter_overlay_window (system-overlay offers) |
| Notifications | flutter_local_notifications |
| Persistence | SharedPreferences |
| UX | audioplayers, vibration (haptics), sliding_action_button, flutter_contacts |
| i18n | Flutter l10n (en / hi / mr) |

### Admin Console
| Layer | Technology |
|-------|-----------|
| Framework | Angular 20.3 + Ionic 8.7 |
| Real-time | socket.io-client 4.8 + ngx-socket-io |
| Maps | Google Maps JS API |
| Auth | JWT (Bearer) with route guards + HTTP interceptors |
| Hosting | Firebase Hosting |
| Packaging | Capacitor 7.4 ready (optional tablet/kiosk builds) |

### Backend Platform (api.cercacars.online)
| Layer | Technology |
|-------|-----------|
| API | Node.js REST API |
| Real-time | Socket.IO server (room-based event hub) |
| Database | MongoDB with GeoJSON geospatial indexing |
| Payments | Razorpay (orders, verification, reconciliation) |
| Push | Firebase Cloud Messaging |
| Maps proxy | Google Places / Directions server-side proxy |
| Auth | JWT-based, per-role (rider / driver / vendor / admin) |

---

## 🌍 Localization & Accessibility

- **Three languages** across rider and driver apps: **English, Hindi, Marathi** — switchable in-app at runtime, persisted per user
- Timezone-aware pricing windows (`Asia/Kolkata` surge multipliers)
- Currency and locale-aware formatting throughout

---

## 🔐 Security

- **JWT authentication** on both HTTP (Bearer interceptors) and socket connections, per role
- **Dual-OTP trip verification** preventing pickup/drop fraud
- **Server-side payment verification** — Razorpay signatures verified on the backend, never trusted from the client
- **API-key protection** — Places API proxied server-side; keys not exposed in client bundles
- **Account enforcement** — blocked/inactive detection at the interceptor level with immediate hard-gating in-app
- **Revocable share links** — trip-sharing tokens can be invalidated at any time
- **Audit trails** — dispute resolutions, wallet adjustments, ride timelines, and payout processing are all logged
- **Document-verified supply side** — no driver or vehicle enters the marketplace without multi-stage document approval
- **HTTPS / WSS** transport throughout

---

*Cerca — a complete, real-time, three-sided ride-hailing marketplace: rider app, driver app, fleet-vendor workflows, and a live operations console, unified by one event-driven backbone.*

---

**Last Updated:** 2026-07-30
**Version:** 2.0.0
**Scope:** Entire Cerca System — Rider App · Driver App · Admin Console · Backend Platform
