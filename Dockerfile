FROM python:3.11-slim

WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/ backend/
COPY services/ services/
COPY providers/ providers/
COPY frontend/ frontend/
COPY branding/ branding/
COPY .env.example .env.example
COPY auth_data.json auth_data.json
COPY user_usage_data.json user_usage_data.json
COPY start_server.py start_server.py

# Create directories for persistent data
RUN mkdir -p uploads brochure_sessions exports_tmp data/epc

# Set write permissions for uploads and sessions
RUN chmod -R 777 uploads brochure_sessions exports_tmp data

# Expose port (Railway will override this with $PORT)
EXPOSE 8000

# Default port (Railway overrides with $PORT)
ENV PORT=8000

# Start using the startup script
CMD ["python", "start_server.py"]
