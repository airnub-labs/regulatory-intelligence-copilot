# Dockerfile for mcp-memgraph
# Builds from official Memgraph ai-toolkit repository
# https://github.com/memgraph/ai-toolkit/tree/main/integrations/mcp-memgraph

FROM python:3.13-slim

WORKDIR /app

# Install git and build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

# Clone the ai-toolkit repository
RUN git clone --depth 1 https://github.com/memgraph/ai-toolkit.git /tmp/ai-toolkit

# Copy the mcp-memgraph integration
RUN cp -r /tmp/ai-toolkit/integrations/mcp-memgraph/* /app/ \
    && rm -rf /tmp/ai-toolkit

# Install dependencies using pip
RUN pip install --no-cache-dir .

# Default environment variables (can be overridden by docker-compose)
# These are just defaults for standalone usage
ENV MCP_TRANSPORT=streamable-http
ENV MCP_READ_ONLY=false

# Expose HTTP port (used when MCP_TRANSPORT=streamable-http)
EXPOSE 8000

# Run the MCP server
CMD ["mcp-memgraph"]
