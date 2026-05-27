# Sistema de Reembolso

Projeto React pronto para publicar no Vercel.

## Como publicar no Vercel

1. Extraia este ZIP no seu computador.
2. Acesse https://vercel.com.
3. Clique em Add New Project.
4. Se aparecer a opção de upload/importação manual, envie esta pasta.
5. Framework: Vite.
6. Build Command: npm run build.
7. Output Directory: dist.
8. Clique em Deploy.

## Firebase

O Firebase já está configurado no arquivo `src/App.jsx`.

Antes de publicar, confirme no Firebase:
- Authentication > Anonymous ativado.
- Firestore Database criado.
- Rules publicadas permitindo leitura e escrita.
