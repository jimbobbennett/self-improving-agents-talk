# Final Thanksgiving Chatbot

This folder is the final demo version: the original app with the code changes from [PR #1](https://github.com/jimbobbennett/self-improving-agents-talk/pull/1) applied. The original baseline remains in [`../original/`](../original/).

The app reads its dish search fixture from the repo-level [`data/`](../data/) folder. Evaluator prompts, query sets, and Arize task configuration are in [`evals/`](../evals/).

Run the final app from this directory:

```sh
npm install
npm start
```

Set `OPENAI_API_KEY` to run the agent. Set `ARIZE_API_KEY`, `ARIZE_SPACE_ID`, and `ARIZE_PROJECT_NAME=thanksgiving-food-lore-demo` to send traces to Arize AX.
