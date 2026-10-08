#[derive(Debug, Clone, serde::Serialize)]
pub struct Segment {
    pub start: f64,
    pub end: f64,
    pub speaker_id: usize,
}

#[cfg(feature = "diarize")]
pub fn diarize(model_path: &str, samples: &[f32]) -> anyhow::Result<Vec<Segment>> {
    use anyhow::Context;

    nemotron_diarize_rs::Diarizer::new(model_path)
        .and_then(|mut diarizer| diarizer.diarize_samples(samples))
        .map(|segments| {
            segments
                .into_iter()
                .map(|segment| Segment {
                    start: segment.start,
                    end: segment.end,
                    speaker_id: segment.speaker_id,
                })
                .collect()
        })
        .with_context(|| format!("speaker recognition failed with model '{model_path}'"))
}

#[cfg(not(feature = "diarize"))]
pub fn diarize(_model_path: &str, _samples: &[f32]) -> anyhow::Result<Vec<Segment>> {
    anyhow::bail!(
        "This server was built without speaker recognition support. Rebuild vibe-server with the 'diarize' feature enabled."
    )
}

#[cfg(test)]
mod tests {
    #[test]
    fn an_unavailable_model_never_silently_skips_speakers() {
        let directory = tempfile::tempdir().unwrap();
        let model = directory.path().join("missing.gguf");
        let error = super::diarize(model.to_str().unwrap(), &[0.0; 1600]).unwrap_err();
        #[cfg(feature = "diarize")]
        assert!(format!("{error:#}").contains("missing.gguf"));
        #[cfg(not(feature = "diarize"))]
        assert!(error.to_string().contains("without speaker recognition support"));
    }
}
