{{- define "retain-ai.fullname" -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- define "retain-ai.labels" -}}
app.kubernetes.io/name: retain-ai
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
