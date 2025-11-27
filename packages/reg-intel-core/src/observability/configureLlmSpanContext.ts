import { setSpanContextResolver } from '@reg-copilot/reg-intel-llm';

import { getContext } from './requestContext.js';

// Bridge the core request context into LLM span logs without introducing a hard dependency the other way around.
setSpanContextResolver(() => getContext());
