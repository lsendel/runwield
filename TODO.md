- [ ] do another code review and optimization pass with Opus 4.6 I did of the cmd files but more is needed. I also told
      it to optimize the uiAPI and I seem to have stabilized it.
- [ ] more tests
- [ ] Start implementing the code indexing
- [ ] Auto-sleep: trigger memory consolidation automatically at session end when a threshold is crossed (e.g.,
      memories_added_since_last_sleep >= 10 OR total_memory_count > 50). Show brief "Running memory consolidation..."
      before exit. Natural boundary — user is done, latency acceptable, fresh context to consolidate.
- [ ] When re-executing a completed plan, warn the user if files in `affectedPaths` have changed since the plan ran.
      Show a list of commits between the plan's `updatedAt` (or `createdAt`) and HEAD as a heads-up before kicking off
      execution again.
- [ ] Plan archiving: move old plans (e.g., completed > N days) into `plans/archive/` so the active plans list stays
      short. Surface archived plans only on explicit request.
- [ ] Optional plan-review step after `completed`: add an `in_review` state between approved-execution and `completed`
      so a code-review/plan-review pass can sign off before the plan is closed.
- [ ] Look at mastra framework to see if we can incorporate it for better plan management and execution control.
