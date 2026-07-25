# AgentConnect Insurance

A demonstration of an insurance product for AI agents that move money. The application implements the Agent Insurance Framework, prices premiums in $NEAR, and covers the full life of a policy: enrollment, pricing, coverage, claims, and denial.

The policy insures the delegation given to an agent and the machinery that enforces it, not the model's judgment. It covers an agent that an attacker manipulated. It does not cover an agent that produced a wrong result on its own.

## Product rules

**Eligibility.** Four controls gate every quote: a registered configuration hash, enforced transfer caps, an enforced payee whitelist, and action logging. The insurer declines any agent missing one of them.

**Pricing.** The premium starts at 0.6% of the agent's per-transaction cap. Each skipped optional control adds a published surcharge. The total rate never exceeds 3.0%. The Show the math toggle expands every figure into its full arithmetic.

**Coverage.** Six coverages respond to a breached mandate, a manipulated agent, stolen credentials, a failed guardrail, liability to counterparties, and response and recovery costs. The controls an Operator runs determine which coverages apply. Users do not select coverages.

**Claims.** The Operator must notify the programme within 48 hours of discovery. The records a compliant stack already produces fill most of the twelve-item evidence package. The insurer acknowledges a claim within 2 business days, decides it within 30 days of a complete package, and pays within 10 days of the decision. The insurer delivers denials as reasoned determinations that cite the governing clause.

## Roles

The Operator takes out the policy for itself and its enrolled Principals. The application offers three enrollment journeys.

| Role | Journey |
| --- | --- |
| Operator | Verify the company, register agents, set mandates and controls, review the quote, and pay. |
| Principal | Verify the organization, review the mandate the Operator prepared, and countersign it. Principals pay nothing. The insurer pays a Principal's losses directly to the Principal. |
| Operator and Principal | Complete the full enrollment. An authorized officer countersigns the mandate in-house. |

## Running the application

```bash
npm install
npm run dev
```

The application runs at `http://localhost:5173`.

```bash
npm test        # run the test suite
npm run build   # typecheck and produce a production build
```

## Application structure

| Route | Screen |
| --- | --- |
| `/` | Landing page and role selection |
| `/verify` | Company verification (KYB) |
| `/connect` | Agent registration and ownership challenge |
| `/mandate` | Mandate authoring and countersignature |
| `/controls` | Safety controls and live pricing |
| `/quote` | Quote, coverages, and exclusions |
| `/fleet` | Fleet enrollment |
| `/pay` | Payment and activation |
| `/review` | Principal review and countersignature |
| `/policies` | Policy dashboard |
| `/coverage` | Coverage detail and the scenario explorer |
| `/claim` | Claims flow |
| `/dashboard` | Programme dashboard (underwriting-side portfolio view) |

## Data and simulation

The browser holds all data. Save session writes the session to local storage, and the application restores it on the next visit. Reset returns the application to its sample fleet.

The application simulates verifications, signatures, and payments, and marks each with a Simulated badge. The $NEAR reference price is live: the application fetches it from CoinGecko every minute and stamps every monetary figure with the rate, its source, and its timestamp.

## Framework

The product logic follows the Agent Insurance Framework: the six insuring agreements, the model conduct boundary, the tier-1 eligibility gates, the published rate schedule, the disclosure requirements, and the claims terms. Clause references in the interface (T3.2, D2.5, 5.8.2, Appendix 3) point into that document.
