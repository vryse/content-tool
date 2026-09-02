# Before / after: targeted editorial revision

> This is a compact, reproducible presentation fixture for the UI, using only the approved facts below. Replace its scores with a live capture after Protecto AI source documents and an API key are supplied; this repository deliberately contains neither. The sequence and data shapes are the exact ones persisted by the application.

## Requirements

\`\`\`json
{
  "company": "Protecto AI",
  "topic": "Reducing PII exposure in AI support copilots",
  "target_audience": "Security and privacy leaders",
  "target_word_count": 420,
  "key_points": [
    "Map PII before it reaches the model",
    "Tokenise sensitive identifiers at the application boundary",
    "Keep the re-identification path under policy control"
  ],
  "required_sections": ["Map the exposure", "Build the control plane"],
  "notes": "Approved scenario: an address change request contains a name, phone number, and account number."
}
\`\`\`

## V1 article

# Treat the boundary as the control

## Why support copilots need a privacy boundary

AI support copilots can make ordinary service work faster, but speed is not a control. An address-change request can contain a name, phone number, and account number in one short message. If that message reaches a model unchanged, the organization has already expanded the system that can see personal data.

The useful question is not whether the copilot is helpful. It is which fields it needs to complete the task and which fields it does not. That distinction gives privacy teams something they can govern.

## Map the exposure

Start with the request path. Record where the message enters, where it is classified, what is sent to the model, and where the resulting answer is stored. The map should include logs, analytics tools, and evaluation datasets—not only the production prompt.

A field-level map makes policy review concrete. It also makes it possible to test whether a change to the copilot introduced a new route for sensitive data.

## Build the control plane

Tokenisation can replace a customer account number with a stable reference before the prompt is assembled. The application can retrieve the real value only where a policy permits it. The model remains useful because it can reason about the request and the reference without receiving the identifier itself.

## The operating model

A privacy boundary needs ownership. Product, security, and support teams should agree on the approved fields, the exception path, and the evidence retained for review. Without that operating model, controls become implementation details that disappear in the next integration.

## V1 evaluation

| Dimension | Score |
| --- | ---: |
| Structure | 92.0 |
| Readability | 74.0 |
| Style | 70.0 |
| Relevance | 82.0 |
| Completeness | 88.0 |
| Content quality | 76.0 |
| **Overall** | **80.6** |

Strengths: clear control sequence; required sections present.

Weaknesses: the opening explains the risk but starts abstractly; the operating model is generic.

Generic-sounding passage: “A privacy boundary needs ownership.”

## Human feedback

> The intro is too generic. Open with the address-change breach scenario immediately, then show why tokenisation protects the model boundary. Make the operating model more concrete about who approves re-identification.

## Derived revision instructions

\`\`\`json
[
  {
    "target": "__intro__",
    "change_type": "rewrite",
    "instruction": "Open with the approved address-change scenario, then explain that tokenisation keeps the name, phone number, and account number outside the model boundary.",
    "source": "human",
    "priority": 1
  },
  {
    "target": "The operating model",
    "change_type": "expand",
    "instruction": "Name the accountable approver for re-identification and state how exceptions are recorded for review.",
    "source": "human",
    "priority": 2
  },
  {
    "target": "__global__",
    "change_type": "tone",
    "instruction": "Replace generic governance language with concrete operating responsibilities.",
    "source": "evaluator",
    "priority": 4
  }
]
\`\`\`

## V2 article

# Treat the boundary as the control

## Why support copilots need a privacy boundary

A customer asks support to change an address and includes their name, phone number, and account number in the same message. If a copilot sends that message to a model unchanged, three identifiers cross the boundary before anyone has decided whether the task needs them.

Tokenisation changes that decision point. The application can replace the account number with a stable reference, retain the identifying fields in the approved system of record, and give the model only the task context it needs to draft a useful response.

## Map the exposure

Start with the request path. Record where the message enters, where it is classified, what is sent to the model, and where the resulting answer is stored. The map should include logs, analytics tools, and evaluation datasets—not only the production prompt.

A field-level map makes policy review concrete. It also makes it possible to test whether a change to the copilot introduced a new route for sensitive data.

## Build the control plane

Tokenisation can replace a customer account number with a stable reference before the prompt is assembled. The application can retrieve the real value only where a policy permits it. The model remains useful because it can reason about the request and the reference without receiving the identifier itself.

## The operating model

The privacy owner approves the fields that can be re-identified and names the service role allowed to request it. Each exception records the request purpose, approver, reference token, and retention period in the review log. Product teams can then change the copilot without quietly turning a one-time exception into a default data path.

## V2 evaluation

| Dimension | V1 | V2 | Delta |
| --- | ---: | ---: | ---: |
| Structure | 92.0 | 92.0 | 0.0 |
| Readability | 74.0 | 76.0 | +2.0 |
| Style | 70.0 | 78.0 | +8.0 |
| Relevance | 82.0 | 88.0 | +6.0 |
| Completeness | 88.0 | 91.0 | +3.0 |
| Content quality | 76.0 | 85.0 | +9.0 |
| **Overall** | **80.6** | **85.5** | **+4.9** |

The first two sections outside the targeted intro are byte-identical between V1 and V2. If a live revision lowers the overall score, the application keeps both records and the delta visible rather than presenting a manufactured improvement.

