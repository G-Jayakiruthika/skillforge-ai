# Legal documents

> **These are drafts, not legal advice.** They were written to be a sound
> starting point, not a substitute for a lawyer. Have a qualified advisor in
> your jurisdiction review both documents before the first real user signs up.
> Every `<<FILL: ...>>` marker must be replaced first.

| File | Published at | Who must review it |
|---|---|---|
| `TERMS-OF-SERVICE.md` | `frontend/terms.html` | Lawyer |
| `PRIVACY-POLICY.md` | `frontend/privacy.html` (in-app summary) | Lawyer, ideally one who knows the DPDP Act |

## The one thing that most needs a decision

SkillForge AI is built for students. Under India's **Digital Personal Data
Protection Act 2023**, anyone under 18 is a child, and processing a child's
personal data requires **verifiable parental consent**. The Act also forbids
behavioural tracking and targeted advertising directed at children.

The app today asks for a date of birth nowhere and has no parental-consent
flow. Three ways forward, in order of how much work each is:

1. **Restrict sign-up to 18+.** Add an age declaration at sign-up and state the
   limit in the Terms. Least work, and honest, as long as it is enforced.
2. **Institution-mediated consent.** Colleges sign up and the institution
   carries the consent relationship for its students. Fits the faculty portal
   that already exists.
3. **Build verifiable parental consent.** Most work, and the only option that
   lets under-18s sign up directly.

Until one of these is in place, do not open public sign-up to minors.
