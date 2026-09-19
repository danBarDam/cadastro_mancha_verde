// Calcula a idade em anos completos a partir de uma data de nascimento "aaaa-mm-dd".
// Retorna null se a data estiver vazia ou inválida.
export function calcularIdade(dataNascimento) {
  if (!dataNascimento) return null;

  const nascimento = new Date(`${dataNascimento}T00:00:00`);
  if (isNaN(nascimento.getTime())) return null;

  const hoje = new Date();
  let idade = hoje.getFullYear() - nascimento.getFullYear();

  const aindaNaoFezAniversario =
    hoje.getMonth() < nascimento.getMonth() ||
    (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() < nascimento.getDate());

  if (aindaNaoFezAniversario) idade -= 1;

  return idade >= 0 ? idade : null;
}
