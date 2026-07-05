{{- define "retain-api.name" -}}
{{- .Chart.Name -}}
{{- end -}}

{{- define "retain-api.fullname" -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "retain-api.labels" -}}
app.kubernetes.io/name: {{ include "retain-api.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}
