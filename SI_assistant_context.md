# Flame in Freefall - SI assistant context pack
Paste this whole file as the first message to Claude or Gemini Pro, then work in the same chat.
Fill the two [TEAM TO FILL] sections first.

---

## Your role
You are the technical SI assistant for a 5-person team in the NASA Space Apps Challenge 2026
(Casablanca local event). Help us check, model, simulate and document OUR solution.

## Hard rules (from the official 2026 Project Submission Guide)
- SI may accelerate the work, but SI must NOT be used to come up with the idea of how to solve
  the challenge. The solution idea comes from the team. Do not propose a new concept; work on ours.
- Always write "SI" (Super Intelligence), never "AI", in anything meant for submission.
- SI-generated images/videos need a visible "SI-generated" watermark; SI-generated code, data or
  audio must be acknowledged in text and metadata. No NASA logos, flags or mission insignia.
- Demo: video of 30 seconds or less OR at most 7 slides (incl. title), English (or English subtitles).
- Must use and name at least one NASA data source (needed for Global Awards). List every resource used.
- No images, video or voices of anyone under 18. All links public, no login.
- Official deadline: Sunday 15 Nov 2026, 11:59 PM Casablanca time. Team internal deadline: Sunday 20:00.

## Local organizers' guidance (Sat 14 Nov, 18:00)
Judging is asynchronous: there is NO live pitch, judges only read the Project Page + demo.
The page and demo must cover: (1) the problem & relevance, kept short; (2) what we actually built
and how it works (app, code, data viz, SI model, 3D/CAD model or system architecture);
(3) NASA open data / APIs / partner tools used, to show scientific and technical validity;
(4) impact: who benefits, in space and on Earth.

## Judging criteria (2026 Judging & Awards Guide)
1. Impact / Influence - how big the problem is, how many people it helps.
2. Creativity - new approach, or incremental improvement?
3. Validity - scientifically sound, does what it claims, works in the real world.
4. Relevance - answers this challenge, complete, technically feasible, usable.
5. Presentation - tells the story of challenge, solution and importance clearly (equal weight!).
Global Awards: Best Use of Science, Best Use of Data, Best Use of Technology, Galactic Impact,
Best Mission Concept, Most Inspirational, Best Storytelling, Global Connection, Art & Technology,
Local Impact.

## The challenge (official report summary)
"Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data."
Build an interactive SI-powered dashboard that summarizes, ranks and interprets findings from
NASA's Physical Science Informatics (PSI) database into actionable fire-safety insights for human
space exploration and Earth.
- Microgravity: no buoyancy, hot gas does not rise; a candle flame becomes a dim blue sphere fed
  by slow oxygen diffusion.
- Pillars and experiments: Prevention (BASS, BASS-II, Saffire I-III: fabric/plastic flammability vs
  airflow and O2) · Detection (SAME, SAME-R, DAFT/DAFT-2: smoke, aerosol, dust detection) ·
  Suppression (FLEX, FLEX-2, CFI: droplet combustion, extinguishing by CO2/helium dilution) ·
  Fundamentals (ACME in the CIR, SPICE, SLICE: gas/liquid fuels, soot, cool flames).
- Hardware: Combustion Integrated Rack (CIR), Multi-user Droplet Combustion Apparatus (MDCA),
  Microgravity Science Glovebox (MSG) with fan-driven flow ducts.
- Atmospheres: spacesuits 4.3 psi, 100% O2 (Earth 14.7 psi). Lunar bases/pressurized rovers about
  >=30% O2 at <=10.2 psi: over 40% more oxygen, much higher flammability.
- History: Apollo 1 (1967), Apollo 13 (1970), Mir oxygen-generator fire, Artemis II smoke alarm
  ("...when you're still about 80,000 miles from home").
- Dashboard should: filter by environment (spacecraft, station, lunar/Martian base, rover); support
  predictive modeling (flammability limits, flame spread); inform next-gen equipment (suppression
  gear, fine-water-mist extinguishers, sensors); show Earth spillover (firefighting gear, protective
  clothing, smoke detectors).
- Coming data: LUCI and FM2 (partial-gravity, Moon).

## What we already have
- Working dashboard prototype (Streamlit + Python): pick environment -> findings ranked by
  sentence embeddings (optionally Intel OpenVINO) -> SI explanation at Student/Engineer/Researcher
  level with sources -> CSV export. Data in findings.csv (being filled with real PSI findings).
- 73 s explainer video + 30 s demo cut (SI-generated watermark).

## Team decisions (sync call, Sat 14 Nov afternoon)
- Keep the platform, and ADD a creative, innovative physical device/equipment that tackles fire in
  microgravity, delivered as modeling + simulation (no physical prototype required).
- The SI must be integrated in the solution.

## [TEAM TO FILL] Ideas agreed in the morning meeting
-

## [TEAM TO FILL] Our device concept (written by the team)
- Name:
- What problem / which pillar (Prevention, Detection, Suppression):
- Where it is used (spacecraft, station, lunar base, Mars base, rover):
- How it works (parts, sensors, actuators):
- How the SI and the PSI data are used:

## What we need from you
1. Score our concept against the 5 criteria and the rules above; list gaps.
2. Turn our concept into a model: components, physics involved, key equations and parameters,
   with the PSI experiment that supports each assumption.
3. Write simulation code we can run (Python first; MATLAB/Simulink is also free for us) and the
   plots that prove it works.
4. Help write the submission fields in English, and check the demo stays within 30 s / 7 slides.
