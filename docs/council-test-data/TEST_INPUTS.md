# Council App — Test Inputs

## 1. Decision Intake Form (Manual Entry)

Use any of these on the **Decision Intake form** page:

---

### Test Case 1 — Market Expansion
| Field | Value |
|---|---|
| **Title** | Expand to Southeast Asia |
| **Question** | Should we expand our SaaS product into Southeast Asia in Q1 2025? |
| **Context** | We are a B2B SaaS company with 200 enterprise clients in India. Revenue is $5M ARR growing at 40% YoY. We have inbound interest from 12 companies in Singapore and Malaysia. |
| **Constraints** | Budget limited to $500K. No local entity. Engineering at full capacity. Must decide in 30 days. |
| **Stakes** | High — affects 2026 revenue targets and investor narrative. Wrong move dilutes core India focus. |

---

### Test Case 2 — Tech Architecture
| Field | Value |
|---|---|
| **Title** | Migrate to Microservices |
| **Question** | Should we migrate our monolithic backend to microservices architecture? |
| **Context** | 50K daily active users. 800K line monolith, 5 years old. 2-3 outages/month. 15 engineers, releases take 2 weeks. |
| **Constraints** | Cannot reduce feature output >2 weeks. Must maintain 99.9% uptime. Team has limited microservices experience. |
| **Stakes** | High — affects engineering productivity for 3 years. Wrong choice risks technical debt or major outages. |

---

### Test Case 3 — Hiring Decision
| Field | Value |
|---|---|
| **Title** | Hire VP of Sales |
| **Question** | Should we hire a VP of Sales externally or promote our top Sales Manager internally? |
| **Context** | Sales Manager: 3 years, knows product, max team of 4. External candidate: 10 years scaling SaaS $5M→$50M, wants $280K base + equity. |
| **Constraints** | Budget max $250K total comp. Decision needed in 3 weeks. Board watching closely. |
| **Stakes** | Very High — defines go-to-market for 3 years. Wrong hire risks missing ARR targets. |

---

### Test Case 4 — Quick Simple Test
| Field | Value |
|---|---|
| **Title** | Launch Freemium |
| **Question** | Should we launch a freemium tier for our B2B SaaS? |
| **Context** | Currently $500/month minimum. Churn 8%. Competitors have free tiers. Infra cost $3/user/month. |
| **Constraints** | No cannibalisation of paid customers. 6 weeks engineering max. |
| **Stakes** | Medium — could 10x trial volume or create support burden. |

---

## 2. File Upload Page

Upload these files (in `council-test-data/` folder):

| File | Purpose |
|---|---|
| `council_knowledge_base.txt` | RAG document — explains the platform, advisors, pipeline |
| `decisions_batch.csv` | Batch decisions — 5 real business scenarios |

---

## 3. Verdict View Page (after running a decision)

1. First submit a decision from the **Decision Intake form**
2. Note the decision ID from the API response (e.g. `1`, `2`, `3`)
3. Go to **Verdict View** page
4. Enter that ID and click **Load**

---

## 4. AI Chat — Quick Test Questions

Paste any of these into the chat:

- `How does the advisor pipeline work?`
- `What is the confidence scoring system?`
- `How does peer review work in The Council?`
- `What types of decisions work best with this platform?`
- `How long does a full decision pipeline take?`
