/** Keep the default reading balance unless one field can use its peer's spare space. */
export function allocateItemAnswerHeight(available: number, question: number, answer: number, questionShare = 0.618): [number, number] {
  const height = Math.max(0, available);
  const defaultQuestion = height * questionShare;
  const defaultAnswer = height - defaultQuestion;
  let questionHeight = defaultQuestion;
  if (question > defaultQuestion && answer < defaultAnswer) {
    questionHeight = Math.min(question, height - answer);
  } else if (answer > defaultAnswer && question < defaultQuestion) {
    questionHeight = Math.max(question, height - answer);
  }
  return [questionHeight, height - questionHeight];
}
