"use client";

import { Button } from "@/components/ui/button";
import {
  copyReviewToClipboard,
  isLowRating,
  loadTangifyRating,
  MANAGEMENT_WHATSAPP_URL,
  openGoogleMapsReview,
  saveTangifyRating,
  shouldGenerateReviews,
  type TangifyRatingRecord,
} from "@/src/utils/tangify_rating_storage";
import { generateTangifyReview } from "@/src/utils/tangify_api";
import clsx from "clsx";
import { Niconne } from "next/font/google";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaStar, FaWhatsapp } from "react-icons/fa";

const niconne = Niconne({ subsets: ["latin"], weight: "400" });

type PageMode = "form" | "saved";

function StarPicker({
  rating,
  onChange,
  disabled,
}: {
  rating: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(0);

  return (
    <div className="flex items-center justify-center gap-2">
      {[1, 2, 3, 4, 5].map((value) => {
        const active = value <= (hover || rating);
        return (
          <button
            key={value}
            type="button"
            disabled={disabled}
            aria-label={`Rate ${value} stars`}
            className={clsx(
              "p-1 transition-transform disabled:opacity-50",
              !disabled && "hover:scale-110"
            )}
            onMouseEnter={() => !disabled && setHover(value)}
            onMouseLeave={() => !disabled && setHover(0)}
            onClick={() => onChange(value)}
          >
            <FaStar
              className={clsx(
                "h-10 w-10",
                active ? "text-yellow-500" : "text-gray-600"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

function WhatsAppFeedbackButton() {
  return (
    <Button
      asChild
      className="w-full bg-green-600 text-white hover:bg-green-500"
    >
      <a
        href={MANAGEMENT_WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        <FaWhatsapp className="mr-2 h-5 w-5" />
        Send feedback to management
      </a>
    </Button>
  );
}

function ReviewCopiedModal({ onContinue }: { onContinue: () => void }) {
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    const redirectTimer = window.setTimeout(() => {
      onContinue();
    }, 1000);

    const buttonTimer = window.setTimeout(() => {
      setShowButton(true);
    }, 5000);

    return () => {
      window.clearTimeout(redirectTimer);
      window.clearTimeout(buttonTimer);
    };
  }, [onContinue]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-800 bg-gray-950 p-6 text-center shadow-xl">
        <p className="text-lg font-semibold text-green-300">Review copied!</p>
        <p className="mt-3 text-sm leading-relaxed text-gray-300">
          Your review is on the clipboard. On the next page, just paste it in
          the review box.
        </p>
        {!showButton ? (
          <p className="mt-6 text-sm text-gray-500">Opening Google review...</p>
        ) : (
          <Button
            type="button"
            className="mt-6 w-full bg-yellow-500 text-black hover:bg-yellow-400"
            onClick={onContinue}
          >
            Open Google review
          </Button>
        )}
      </div>
    </div>
  );
}

export default function RatePage() {
  const [mode, setMode] = useState<PageMode>("form");
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [savedRecord, setSavedRecord] = useState<TangifyRatingRecord | null>(
    null
  );
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ratingRef = useRef(0);

  const applySavedRecord = useCallback((record: TangifyRatingRecord) => {
    setSavedRecord(record);
    setRating(record.rating);
    ratingRef.current = record.rating;
    setReview(record.review);
    setSubmitted(record.submitted === true);
    setMode("saved");
  }, []);

  useEffect(() => {
    const existing = loadTangifyRating();
    if (existing) {
      applySavedRecord(existing);
    }
  }, [applySavedRecord]);

  const saveLowRating = useCallback((nextRating: number) => {
    const record: TangifyRatingRecord = {
      rating: nextRating,
      review: "",
      updatedAt: Date.now(),
      submitted: false,
    };
    saveTangifyRating(record);
    setSavedRecord(record);
    setReview("");
    setSubmitted(false);
    setMode("saved");
  }, []);

  const generateReview = useCallback(async (nextRating: number) => {
    if (!shouldGenerateReviews(nextRating)) {
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const nextReview = await generateTangifyReview(nextRating);
      if (!shouldGenerateReviews(ratingRef.current)) {
        return;
      }
      setReview(nextReview);
    } catch (err) {
      console.error("Failed to generate review:", err);
      if (shouldGenerateReviews(ratingRef.current)) {
        setError("Could not generate review right now. Try again?");
      }
    } finally {
      setGenerating(false);
    }
  }, []);

  const handleRatingChange = (nextRating: number) => {
    const previousRating = ratingRef.current;
    setRating(nextRating);
    ratingRef.current = nextRating;
    setError(null);

    if (nextRating !== previousRating) {
      setSubmitted(false);
    }

    if (isLowRating(nextRating)) {
      saveLowRating(nextRating);
      return;
    }

    if (previousRating > 0 && isLowRating(previousRating)) {
      setReview("");
      void generateReview(nextRating);
      setMode("form");
      return;
    }

    if (!review.trim()) {
      void generateReview(nextRating);
      return;
    }

    if (previousRating === 0) {
      return;
    }

    if (nextRating > previousRating) {
      setReview("");
      void generateReview(nextRating);
    }
  };

  const startEditing = () => {
    if (!savedRecord) {
      return;
    }
    setRating(savedRecord.rating);
    ratingRef.current = savedRecord.rating;
    setReview(savedRecord.review);
    setMode("form");
    setSubmitted(false);
    setError(null);
  };

  const handleSubmit = async () => {
    if (rating < 1 || rating > 5) {
      setError("Pick a star rating first.");
      return;
    }
    if (!review.trim()) {
      setError("Review text is empty.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const record: TangifyRatingRecord = {
      rating,
      review: review.trim(),
      updatedAt: Date.now(),
      submitted: true,
    };
    saveTangifyRating(record);
    setSavedRecord(record);
    setSubmitted(true);
    setMode("saved");

    await copyReviewToClipboard(review.trim());
    setCopyModalOpen(true);
    setSubmitting(false);
  };

  const handleOpenGoogleFromSaved = async () => {
    if (!savedRecord?.review.trim()) {
      return;
    }
    await copyReviewToClipboard(savedRecord.review);
    setCopyModalOpen(true);
  };

  const handleContinueToGoogle = useCallback(() => {
    setCopyModalOpen(false);
    openGoogleMapsReview();
  }, []);

  const showWhatsAppFeedback =
    submitted && mode === "saved" && savedRecord !== null;

  return (
    <div className="min-h-screen bg-black px-4 py-8 text-white">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
        <div className="text-center">
          <h1
            className={clsx(
              niconne.className,
              "text-4xl font-niconne text-yellow-500"
            )}
          >
            Rate Tangify
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            How was your experience? Tap the stars.
          </p>
        </div>

        {mode === "saved" && savedRecord ? (
          isLowRating(savedRecord.rating) ? (
            <div className="space-y-4 rounded-xl border border-green-900/60 bg-green-950/30 p-5 text-center">
              <div className="flex justify-center gap-1">
                {[1, 2, 3, 4, 5].map((value) => (
                  <FaStar
                    key={value}
                    className={clsx(
                      "h-4 w-4",
                      value <= savedRecord.rating
                        ? "text-yellow-500"
                        : "text-gray-700"
                    )}
                  />
                ))}
              </div>
              <p className="text-lg font-medium text-green-300">
                Thank you for the rating.
              </p>
              <Button type="button" variant="secondary" onClick={startEditing}>
                Change rating
              </Button>
            </div>
          ) : (
            <div className="space-y-4 rounded-xl border border-gray-800 bg-gray-950 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400">Your saved review</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <FaStar
                      key={value}
                      className={clsx(
                        "h-4 w-4",
                        value <= savedRecord.rating
                          ? "text-yellow-500"
                          : "text-gray-700"
                      )}
                    />
                  ))}
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-200">
                {savedRecord.review}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={startEditing}>
                  Edit review
                </Button>
                <Button
                  type="button"
                  className="bg-yellow-500 text-black hover:bg-yellow-400"
                  onClick={() => void handleOpenGoogleFromSaved()}
                >
                  Copy & open Google review
                </Button>
              </div>
            </div>
          )
        ) : null}

        {mode === "form" ? (
          <div className="space-y-5 rounded-xl border border-gray-800 bg-gray-950 p-5">
            <StarPicker
              rating={rating}
              onChange={handleRatingChange}
              disabled={generating || submitting}
            />

            {rating > 0 ? (
              <p className="text-center text-sm text-gray-400">
                {rating} out of 5 stars
              </p>
            ) : null}

            {isLowRating(rating) && rating > 0 ? (
              <div className="space-y-2 rounded-xl border border-green-900/60 bg-green-950/30 p-4 text-center">
                <p className="text-base font-medium text-green-300">
                  Thank you for the rating.
                </p>
              </div>
            ) : null}

            {generating ? (
              <p className="text-center text-sm text-gray-400">
                Writing your review...
              </p>
            ) : null}

            {review && shouldGenerateReviews(rating) ? (
              <div className="space-y-2">
                <label htmlFor="review-text" className="text-sm text-gray-400">
                  Your review (edit if you want)
                </label>
                <textarea
                  id="review-text"
                  value={review}
                  onChange={(event) => setReview(event.target.value)}
                  rows={5}
                  className="w-full rounded-lg border border-gray-700 bg-black px-3 py-2 text-sm text-white outline-none focus:border-yellow-500"
                  disabled={submitting}
                />
              </div>
            ) : null}

            {error ? (
              <p className="text-center text-sm text-red-400">{error}</p>
            ) : null}

            {shouldGenerateReviews(rating) ? (
              <>
                <Button
                  type="button"
                  className="w-full bg-yellow-500 text-black hover:bg-yellow-400"
                  disabled={
                    submitting || generating || rating < 1 || !review.trim()
                  }
                  onClick={() => void handleSubmit()}
                >
                  {submitting ? "Copying..." : "Submit review"}
                </Button>
                {review ? (
                  <p className="text-center text-xs text-gray-500">
                    Review will be copied — you paste it on Google Maps
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}

        {showWhatsAppFeedback ? <WhatsAppFeedbackButton /> : null}
      </div>

      {copyModalOpen ? (
        <ReviewCopiedModal onContinue={handleContinueToGoogle} />
      ) : null}
    </div>
  );
}
