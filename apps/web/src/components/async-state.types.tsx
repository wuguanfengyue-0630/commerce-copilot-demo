import { AsyncState } from "./async-state.tsx";

void (<AsyncState state="error" onRetry={() => undefined} />);
void (<AsyncState state="loading" />);
void (<AsyncState state="empty" />);

// @ts-expect-error Error states must always provide a recovery action.
void (<AsyncState state="error" />);

// @ts-expect-error Loading states do not accept retry callbacks.
void (<AsyncState state="loading" onRetry={() => undefined} />);

// @ts-expect-error Empty states do not accept retry callbacks.
void (<AsyncState state="empty" onRetry={() => undefined} />);
