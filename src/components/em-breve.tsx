export function EmBreve({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="p-8">
      <h1 className="text-xl font-bold text-[#142B3A] mb-2">{titulo}</h1>
      <div className="bg-white border border-dashed border-[#E3DACB] rounded-lg p-10 text-center max-w-lg">
        <p className="text-sm font-semibold text-[#B96343] mb-2">Em breve</p>
        <p className="text-sm text-[#59636A]">{descricao}</p>
      </div>
    </div>
  );
}
