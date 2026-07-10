import os
import contextlib
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.trace import NoOpTracerProvider

_EXPORTER = os.getenv("OTEL_EXPORTER", "jaeger").lower()
_SERVICE_NAME = os.getenv("OTEL_SERVICE_NAME", "agentforge")
_OTLP_ENDPOINT = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318")


def _build_exporter():
    if _EXPORTER in ("jaeger", "aws", "datadog"):
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        return OTLPSpanExporter(endpoint=f"{_OTLP_ENDPOINT}/v1/traces")

    if _EXPORTER == "azure":
        try:
            from azure.monitor.opentelemetry.exporter import AzureMonitorTraceExporter
            conn_str = os.getenv("AZURE_MONITOR_CONNECTION_STRING", "")
            return AzureMonitorTraceExporter(connection_string=conn_str)
        except ImportError:
            print("WARNING: azure-monitor-opentelemetry-exporter not installed; falling back to console")
            return ConsoleSpanExporter()

    if _EXPORTER == "gcp":
        try:
            from opentelemetry.exporter.cloud_trace import CloudTraceSpanExporter
            project_id = os.getenv("GCP_PROJECT_ID", "")
            return CloudTraceSpanExporter(project_id=project_id or None)
        except ImportError:
            print("WARNING: opentelemetry-exporter-gcp-trace not installed; falling back to console")
            return ConsoleSpanExporter()

    return ConsoleSpanExporter()


def setup_telemetry(app):
    if _EXPORTER == "none":
        trace.set_tracer_provider(NoOpTracerProvider())
        return

    resource = Resource.create({"service.name": _SERVICE_NAME})
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(BatchSpanProcessor(_build_exporter()))
    trace.set_tracer_provider(provider)

    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    FastAPIInstrumentor.instrument_app(app)


def get_tracer():
    return trace.get_tracer("agentforge")


def current_trace_id() -> str:
    span = trace.get_current_span()
    ctx = span.get_span_context()
    if ctx and ctx.is_valid:
        return format(ctx.trace_id, "032x")
    return ""
