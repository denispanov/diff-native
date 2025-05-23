#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Token<'a> {
    pub text: &'a str,
}
