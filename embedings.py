import torch
from transformers import AutoTokenizer, AutoModel
from typing import List, Union
import asyncio
from concurrent.futures import ThreadPoolExecutor
import numpy as np


class OptimizedEmbeddingService:

    def __init__(
        self,
        model_name: str = "togethercomputer/m2-bert-80M-32k-retrieval",
        max_workers: int = None,
        batch_size: int = 32,
        max_length: int = 512,
    ):
        self.model_name = model_name
        self.batch_size = batch_size
        self.max_length = max_length

        self.device = self._get_optimal_device()
        print(f"Using device: {self.device}")

        print(f"Loading model: {model_name}")
        self.tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
        self.model = AutoModel.from_pretrained(model_name, trust_remote_code=True)
        self.model.to(self.device)
        self.model.eval()

        if self.device.type == "cpu":
            torch.set_num_threads(torch.get_num_threads())
            print(f"CPU threads: {torch.get_num_threads()}")

        if max_workers is None:
            max_workers = min(32, (torch.get_num_threads() or 8))
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        print(f"Thread pool workers: {max_workers}")

    def _get_optimal_device(self) -> torch.device:
        if torch.cuda.is_available():
            return torch.device("cuda")
        elif torch.backends.mps.is_available():
            return torch.device("mps")
        else:
            return torch.device("cpu")

    @torch.inference_mode()
    def _embed_batch(self, texts: List[str]) -> np.ndarray:
        encoded = self.tokenizer(
            texts,
            padding=True,
            truncation=True,
            max_length=self.max_length,
            return_tensors="pt"
        )

        encoded = {k: v.to(self.device) for k, v in encoded.items()}

        outputs = self.model(**encoded)

        # Handle both tuple and object outputs
        if isinstance(outputs, tuple):
            last_hidden_state = outputs[0]
        else:
            last_hidden_state = outputs.last_hidden_state

        embeddings = self._mean_pooling(
            last_hidden_state,
            encoded['attention_mask']
        )

        embeddings = torch.nn.functional.normalize(embeddings, p=2, dim=1)

        return embeddings.cpu().numpy()

    def _mean_pooling(
        self,
        token_embeddings: torch.Tensor,
        attention_mask: torch.Tensor
    ) -> torch.Tensor:
        input_mask_expanded = (
            attention_mask.unsqueeze(-1)
            .expand(token_embeddings.size())
            .float()
        )
        sum_embeddings = torch.sum(token_embeddings * input_mask_expanded, 1)
        sum_mask = torch.clamp(input_mask_expanded.sum(1), min=1e-9)
        return sum_embeddings / sum_mask

    async def embed_async(
        self,
        texts: Union[str, List[str]]
    ) -> Union[List[float], List[List[float]]]:
        if isinstance(texts, str):
            texts = [texts]
            single_input = True
        else:
            single_input = False

        all_embeddings = []

        batches = [
            texts[i:i + self.batch_size]
            for i in range(0, len(texts), self.batch_size)
        ]

        loop = asyncio.get_event_loop()
        tasks = [
            loop.run_in_executor(self.executor, self._embed_batch, batch)
            for batch in batches
        ]

        batch_results = await asyncio.gather(*tasks)

        all_embeddings = np.vstack(batch_results)

        result = all_embeddings.tolist()

        if single_input:
            return result[0]
        return result

    def embed_sync(
        self,
        texts: Union[str, List[str]]
    ) -> Union[List[float], List[List[float]]]:
        if isinstance(texts, str):
            texts = [texts]
            single_input = True
        else:
            single_input = False

        all_embeddings = []

        for i in range(0, len(texts), self.batch_size):
            batch = texts[i:i + self.batch_size]
            batch_embeddings = self._embed_batch(batch)
            all_embeddings.append(batch_embeddings)

        all_embeddings = np.vstack(all_embeddings)

        result = all_embeddings.tolist()

        if single_input:
            return result[0]
        return result

    def get_embedding_dimension(self) -> int:
        dummy_embedding = self.embed_sync("test")
        return len(dummy_embedding)

    def __del__(self):
        if hasattr(self, 'executor'):
            self.executor.shutdown(wait=True)
