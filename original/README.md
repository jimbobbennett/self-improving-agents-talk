# Original Thanksgiving Chatbot

This folder is the committed baseline app snapshot for the self-improving agents talk. It contains the chat UI, original agent, and tool implementations as they stand at this stage.

The live search fixture is in the repo-level [`data/`](../data/) folder. Evaluator prompts, query sets, and Arize task configuration are in [`evals/`](../evals/).

Run the app from this directory:

```sh
npm install
npm start
```

Set `OPENAI_API_KEY` to run the agent. Set `ARIZE_API_KEY`, `ARIZE_SPACE_ID`, and `ARIZE_PROJECT_NAME=thanksgiving-food-lore-demo` to send traces to Arize AX.
