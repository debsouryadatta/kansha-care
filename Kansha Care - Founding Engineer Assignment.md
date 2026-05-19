# Founding Engineer Assignment

## Context

We are building an elder care service. Homes will be fitted with multiple sensors and devices \- wearables, motion sensors, environmental sensors, emergency buttons. Our software has to ingest data from all of these continuously, detect when something needs attention, alert the right person through the right channel, and stay observable so we know our own system is healthy before our customers do. So this assignment uses a public data source that has the same shape as our real problem: a continuous feed of events, mostly routine, occasionally critical. You will build the ingestion, monitoring, alerting, and dashboard layers around it.

This is a founding engineer role, so we are evaluating product judgment as much as engineering judgment. You will need to decide what to track, not just how to track it. Read the API docs, look at what fields the feed actually exposes, and propose the metrics that you think matter. Why those? Why not others? That reasoning is part of what we're hiring for.

If you do this well, the same patterns will carry directly into the production system you would build with us.

---

## The data source

You will use the USGS Earthquake GeoJSON feeds:

Live feed (for continuous ingestion)

[`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson`](https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson)

This is updated every minute and contains all earthquakes recorded globally in the last hour.

Historical backfill (for one-time seeding)

[`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson`](https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson)

Read the documentation carefully

[`https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php`](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php)

Each event has 20+ properties \- magnitude, depth, place, time, felt, cdi, mmi, alert (PAGER level), tsunami, sig, magType, and more. We are looking for someone who studies what's available, understands what each field means, and makes deliberate choices about which ones are worth surfacing in the dashboard and which to use in the alert and risk-scoring logic.

Both feeds are public, require no authentication, and have no meaningful rate limits beyond once-per-minute caching on the USGS side. Treat each earthquake event like a sensor reading from a device. Treat the live feed itself like a device that can go silent.

---

## What to build

### 1\. Ingestion

The system has two ingestion modes that must work together cleanly:

Initial backfill (one-time). On the first run, fetch the all\_month feed and load all 30 days of events into storage. This populates the dashboard with real historical data so the 1-month views, stats, and risk scores work immediately. 

Live polling (continuous). After backfill, poll the all\_hour feed every minute (the feed itself is cached at 60s on the USGS side, so polling faster is wasted). Each poll, identify which events are new since the last poll and write them to storage. Existing events whose data has changed (revised magnitude, updated location) should be updated in place \- USGS does revise events after publication.

- You pick the database \- SQLite, Postgres, MongoDB, whatever fits.  
- Handle deduplication. The same earthquake will appear in multiple polls.  
- Handle the feed being unreachable, slow, or returning bad data without crashing.  
- The backfill and live polling should not interfere with each other.

2\. Dashboard

A web UI we can open and use. The metrics shown are your call. The dashboard has two sections:

#### **Section A: Global view**

A world-level dashboard tracking earthquake activity everywhere.

a. Incident Tracker 

- A map / table / list   showing recent earthquake events.  
- Visual encoding (tags, color) should reflect what you decide matters most \- magnitude, significance, recency, alert level, or some combination.  
- The time window should be configurable — at minimum last hour, last 24 hours, last 7 days, last 30 days.  
- The view should refresh as new data comes in.

b. System Health \- A clear indicator of ingestion health: when was the last successful poll, success rate over the last hour, current failures if any, whether the initial backfill has completed. This is non-negotiable.

#### **Section B: Per-location view**

The user selects up to 3 locations (e.g., city names). For each location, you build a place-level dashboard showing metrics relevant to that place.

- A risk score based on the proximity, magnitude, and recency of earthquakes near it. The scoring formula is your design.  
- Local activity: events within a configurable radius, counts over 24h / 7d / 30d, largest nearby event in the period.  
- A mini-map or list view of nearby events.  
- The location's active alert thresholds (e.g., "next alert will fire if magnitude ≥ 4.0 within 500 km") \- so the user understands what's being monitored on their behalf.

The selected locations should also drive the alerting rules described in section 4\.

### 4\. Alerting via Telegram

You will create a Telegram bot and share its username with us. We will start a chat with it from our own account. Your system should send messages to whichever chat IDs have messaged the bot \- no shared group needed.

Real-time alerts. When something critical happens, push an alert to the bot immediately. Implement at least these rules:

- High-severity event: any earthquake of magnitude ≥ 5.0 globally, or ≥ 4.0 within 500 km of any user-selected location.  
- Swarm detection: more than 5 earthquakes in any 30-minute window within a 200 km radius.  
- Source silence: the USGS feed has not been successfully polled for more than 10 minutes.

Each real-time alert should include: what triggered it, severity, location, timestamp, and a link or reference back to the dashboard.

Daily summary. Every day at a fixed time, the bot should send a digest covering the last 24 hours:

- Total earthquakes recorded  
- Breakdown by magnitude band  
- Top 3 most active regions  
- Any alerts that fired in the period  
- Current risk scores for the user-selected locations  
- System health summary: poll success rate, any incidents

Real-time alerts and the daily summary are different problems \- one is event-driven and latency-sensitive, the other is scheduled and aggregation-heavy.

### 5\. Deployment

Deploy it somewhere we can access. We should be able to:

- Open the dashboard in a browser  
- See it running with live data  
- Message your Telegram bot from our own account and start receiving alerts and daily summaries

---

## What to submit

- A GitHub repository with all code, a clear README, and local-run instructions.  
- A live deployed URL for the dashboard.  
- A Telegram bot username we can message from our own accounts to receive alerts and daily summaries.  
- An architecture document (max 2 pages) covering:  
  - A high-level system diagram and your reasoning for each choice  
  - A view on how you would scale this from 1 user with 3 locations to 10,000 users with 30,000 locations \- what stays, what changes, what breaks first  
  - Failure modes you considered and how the system handles each  
  - What you deliberately did not do and why

---

## Constraints

- Time: 4 days from receipt. We expect roughly 20-30 hours of focused work.  
- Stack: your choice. Use what you are fastest in.  
- AI tools: You may use them freely (Cursor, Claude Code, Copilot, etc.), but you must remain fully accountable for all architectural and engineering decisions made.  
- Interview: after submission, we will schedule a 60-minute interview to walk through your solution together. Come prepared to discuss your code, your design choices, and your architecture document in depth.

---

## How we evaluate

The architecture document and the conversation in the interview matter as much as the code. We are looking for clear thinking about what to track, why, how to make it reliable, and what to leave out.

---

## Questions

If anything is unclear, please reach out to:

[contact@kansha.care](mailto:contact@kansha.care) 

[abhishekunnamdce@gmail.com](mailto:abhishekunnamdce@gmail.com)