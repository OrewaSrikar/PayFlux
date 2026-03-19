# PayFlux: AI-Based Income Protection for Delivery Partners

---



**Project Name:** PayFlux: AI-Based Income Protection for Delivery Partners

**Team Name:** Valtrix

**College Name:** SRM University Amaravathi

**Hackathon Name:** DEVTrails 2026

---

## Problem Statement

Delivery workers depend on daily income for survival. Their earnings are often affected by weather, traffic, and unexpected disruptions. At present, there is no real-time system to protect their income when deliveries drop suddenly. Most existing insurance models are slow, manual, and claim-based. This delays support when workers need money the most. **A faster and smarter income protection system is required.**

---

## Objective

The objective of GigScore is to automatically detect income loss for delivery partners, provide instant compensation, and reduce financial risk for gig workers.

---

## Proposed Solution

GigScore is an AI-based income protection system for delivery partners. It tracks delivery activity in real time and uses weather and traffic data to detect disruptions. When the system finds that deliveries have dropped because of genuine external conditions, it confirms income loss automatically. The platform then pays the worker instantly. **No claim is needed.**

---

## Workflow

1. **Worker joins the system**
2. **System tracks delivery activity**
3. **Worker Score and Zone Score are calculated**
4. **System continuously monitors worker activity**
5. **It detects a sudden drop in deliveries**
6. **It checks weather and traffic conditions**
7. **It confirms whether income loss is likely**
8. **Payment is sent automatically**

---

## Key Concepts

### Worker Score
Measures the worker's reliability and consistency. It also helps with fraud detection.

### Zone Score
Measures risk in a delivery area based on weather, traffic, and disruption levels.

These two scores help the system make better decisions without using heavy theory.

---

## System Architecture

### Inputs
- Delivery data
- Weather API
- Traffic API

### Processing
- Risk scoring
- Disruption detection

### Decision
- Income loss detection
- Claim trigger

### Output
- Payment system
- Dashboard

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js / FastAPI |
| **AI/ML** | Python |
| **Database** | MongoDB |
| **Cloud** | AWS |
| **External APIs** | Weather API, Maps / Traffic API |

---

## Innovation / Unique Features

- ✅ **Automatic payout without any claim process** - Workers receive compensation instantly without filing claims
- ✅ **Real-time disruption detection** - Continuous monitoring of delivery activity and environmental conditions
- ✅ **Worker + Zone scoring** - Dual scoring mechanism for better accuracy and fraud prevention
- ✅ **Works without past data** - System uses live environmental signals to make decisions even for new workers

---

## Risk Analysis

### False Detection
Reduced using multiple data sources (weather, traffic, delivery patterns)

### Fraud Prevention
Reduced using Worker Score and pattern analysis

### First-time Events
Handled using real-time weather and traffic data instead of historical patterns

---

## Adversarial Defense & Anti-Spoofing Strategy

GigScore is designed to detect genuine income loss while resisting GPS spoofing and organized fraud.

### 1. Differentiation: Genuine Loss vs Fake Location Spoofing

The system does not rely only on GPS coordinates. It checks whether the worker's delivery behavior, route movement, delivery timestamps, device signals, and local disruption conditions match each other.

- **Genuine worker** trapped in bad weather will usually show:
  - Interrupted route progress
  - Failed delivery attempts
  - Local congestion
  - Matching weather/traffic signals

- **Bad actor** spoofing location may show:
  - Location mismatch
  - Unnatural movement
  - Repeated identical patterns
  - Delivery behavior that does not match the claimed zone risk

### 2. Data Used Beyond Basic GPS

GigScore analyzes multiple signals, such as:

- Delivery history and completion rate
- Pickup/drop timestamps
- Route consistency
- Device fingerprint signals
- Network stability patterns
- Weather intensity in the claimed zone
- Traffic congestion in the claimed zone
- Frequency of repeated claims from the same area
- Clustered behavior from multiple suspicious accounts

This multi-source approach makes coordinated fraud rings easier to identify.

### 3. UX Balance for Honest Workers

- Flagged claims are not rejected immediately
- Instead, they move into a soft-verification stage where the system checks more signals before final decision
- If the worker has a genuine network drop or weather-related disruption, the system can still approve the claim using supporting evidence from weather, traffic, and delivery logs
- This avoids unfair punishment while still protecting the platform from mass spoofing attacks

---

## Future Scope

- 🚀 Expand to more gig workers and delivery platforms
- 🚀 Improve AI models for better fraud detection
- 🚀 Integrate directly with major delivery apps

---


